const fs = require('fs').promises;
const path = require('path');
const { assertMutationBound } = require('../../packages/core/dist/modules/persistence/record-pages');

// Experimental only: append frames and expose them after a synced commit marker.
class SegmentAdapter {
  constructor(config, meta, ignoredFs, logger, collectionName, system, queue) {
    this.collectionPath = path.join(system.getOutputPath(), collectionName);
    this.filePath = path.join(this.collectionPath, 'records.segment');
    this.checkpointPath = path.join(this.collectionPath, 'records.index');
    this.queue = queue;
    this.meta = meta;
    this.index = new Map();
    this.generation = 0;
    this.destroyed = false;
    this.initialized = this.initialize();
  }
  checkDestroyed() { if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate'); }
  async initialize() {
    // The production filesystem metadata uses a separate queue. This prototype
    // is fast enough to expose that initialization race, so explicitly join it.
    await this.meta.get();
    await fs.mkdir(this.collectionPath, { recursive: true });
    const handle = await fs.open(this.filePath, 'a+');
    await handle.close();
    await this.recover();
  }
  apply(frame, location) { if (frame.t === 'd') this.index.delete(frame.id); else this.index.set(frame.id, location); }
  async recover() {
    const fileSize = (await fs.stat(this.filePath)).size;
    let baseOffset = 0;
    try {
      const checkpoint = JSON.parse(await fs.readFile(this.checkpointPath, 'utf8'));
      if (checkpoint.offset <= fileSize) {
        baseOffset = checkpoint.offset;
        this.generation = checkpoint.generation;
        this.index = new Map(checkpoint.index);
      }
    } catch {
      // A missing or invalid experimental checkpoint falls back to log replay.
    }
    const handle = await fs.open(this.filePath, 'r');
    const data = Buffer.alloc(fileSize - baseOffset);
    try { await handle.read(data, 0, data.length, baseOffset); } finally { await handle.close(); }
    let offset = 0;
    let committedOffset = baseOffset;
    let pending = [];
    while (offset + 4 <= data.length) {
      const length = data.readUInt32BE(offset);
      if (offset + 4 + length > data.length) break;
      let frame;
      try { frame = JSON.parse(data.subarray(offset + 4, offset + 4 + length).toString()); } catch { break; }
      if (frame.t === 'c') {
        for (const item of pending) this.apply(item.frame, item.location);
        pending = [];
        this.generation += 1;
        committedOffset = baseOffset + offset + 4 + length;
      } else pending.push({ frame, location: { offset: baseOffset + offset + 4, length } });
      offset += 4 + length;
    }
    if (committedOffset < fileSize) await fs.truncate(this.filePath, committedOffset);
  }
  encode(frame) {
    const payload = Buffer.from(JSON.stringify(frame));
    const output = Buffer.allocUnsafe(payload.length + 4);
    output.writeUInt32BE(payload.length, 0);
    payload.copy(output, 4);
    return output;
  }
  async append(frames) {
    if (!frames.length) return;
    await this.initialized;
    const start = (await fs.stat(this.filePath)).size;
    const encoded = frames.map((frame) => ({ frame, data: this.encode(frame) }));
    const output = Buffer.concat([...encoded.map(({ data }) => data), this.encode({ t: 'c', generation: this.generation + 1 })]);
    const handle = await fs.open(this.filePath, 'a');
    try { await handle.writeFile(output); await handle.sync(); } finally { await handle.close(); }
    let offset = start;
    for (const item of encoded) {
      this.apply(item.frame, { offset: offset + 4, length: item.data.length - 4 });
      offset += item.data.length;
    }
    this.generation += 1;
    if (frames.length >= 512) await this.checkpoint(start + output.length);
  }
  async checkpoint(offset) {
    const temporary = `${this.checkpointPath}.tmp`;
    const handle = await fs.open(temporary, 'w');
    try {
      await handle.writeFile(JSON.stringify({ offset, generation: this.generation, index: [...this.index] }));
      await handle.sync();
    } finally { await handle.close(); }
    await fs.rename(temporary, this.checkpointPath);
    const directory = await fs.open(this.collectionPath, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async read(location, existingHandle) {
    const handle = existingHandle || await fs.open(this.filePath, 'r');
    try {
      const data = Buffer.allocUnsafe(location.length);
      await handle.read(data, 0, data.length, location.offset);
      return JSON.parse(data.toString()).row;
    } finally { if (!existingHandle) await handle.close(); }
  }
  async getRecord(id) { this.checkDestroyed(); await this.initialized; const location = this.index.get(id); return location ? this.read(location) : undefined; }
  async getRecords(ids) {
    this.checkDestroyed();
    const rows = new Map();
    for (const id of ids) { const row = await this.getRecord(id); if (row !== undefined) rows.set(id, row); }
    return rows;
  }
  async *iterateRecords() {
    this.checkDestroyed();
    await this.initialized;
    const handle = await fs.open(this.filePath, 'r');
    const chunkBytes = 1024 * 1024;
    let chunkStart = -1;
    let chunk = Buffer.alloc(0);
    try {
      for (const location of this.index.values()) {
        if (location.offset < chunkStart || location.offset + location.length > chunkStart + chunk.length) {
          chunkStart = Math.floor(location.offset / chunkBytes) * chunkBytes;
          const length = Math.max(chunkBytes, location.offset + location.length - chunkStart);
          chunk = Buffer.allocUnsafe(length);
          const result = await handle.read(chunk, 0, length, chunkStart);
          chunk = chunk.subarray(0, result.bytesRead);
        }
        const relative = location.offset - chunkStart;
        yield JSON.parse(chunk.subarray(relative, relative + location.length).toString()).row;
      }
    }
    finally { await handle.close(); }
  }
  async getData() { const rows = []; for await (const row of this.iterateRecords()) rows.push(row); return rows; }
  async insert(rows) { return this.mutateRecords({ puts: rows }); }
  async update(rows) { await this.initialized; return this.mutateRecords({ deletes: [...this.index.keys()], puts: rows }); }
  async mutateRecords(mutation) {
    this.checkDestroyed();
    assertMutationBound(Math.max(mutation.deletes?.length || 0, mutation.puts?.length || 0));
    return this.queue.add(() => this.append([
      ...(mutation.deletes || []).map((id) => ({ t: 'd', id })),
      ...(mutation.puts || []).map((row) => ({ t: 'p', id: row._id, row })),
    ]));
  }
  async cacheRevision() { this.checkDestroyed(); await this.initialized; return String(this.generation); }
  async compact() { this.checkDestroyed(); }
  async storageStats() { this.checkDestroyed(); await this.initialized; const totalBytes = (await fs.stat(this.filePath)).size; return { generation: this.generation, liveBytes: totalBytes, totalBytes, reclaimableBytes: 0, tombstones: 0 }; }
  async destroy() { this.checkDestroyed(); await this.initialized; await fs.rm(this.collectionPath, { recursive: true, force: true }); this.destroyed = true; }
}
module.exports = SegmentAdapter;
