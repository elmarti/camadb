const fs = require('fs').promises;
const path = require('path');
const { assertMutationBound } = require('../../packages/core/dist/modules/persistence/record-pages');

const CHECKPOINT_FORMAT = 1;
const SCAN_CHUNK_BYTES = 1024 * 1024;

// Experimental only: committed append frames plus a lazy, single-file locator.
class SegmentAdapter {
  constructor(config, meta, ignoredFs, logger, collectionName, system, queue) {
    this.collectionPath = path.join(system.getOutputPath(), collectionName);
    this.filePath = path.join(this.collectionPath, 'records.segment');
    this.checkpointPath = path.join(this.collectionPath, 'records.index');
    this.queue = queue;
    this.meta = meta;
    this.overlay = new Map();
    this.shardCache = new Map();
    this.checkpointMeta = undefined;
    this.generation = 0;
    this.nextSequence = 0;
    this.destroyed = false;
    this.initialized = this.initialize();
  }
  checkDestroyed() {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
  shardKey(id) {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    return (hash >>> 24).toString(16).padStart(2, '0');
  }
  async initialize() {
    await this.meta.get();
    await fs.mkdir(this.collectionPath, { recursive: true });
    const handle = await fs.open(this.filePath, 'a+');
    await handle.close();
    await this.recover();
  }
  async readCheckpointFooter(segmentBytes) {
    try {
      const stats = await fs.stat(this.checkpointPath);
      if (stats.size < 4) return;
      const handle = await fs.open(this.checkpointPath, 'r');
      try {
        const lengthBytes = Buffer.allocUnsafe(4);
        await handle.read(lengthBytes, 0, 4, stats.size - 4);
        const length = lengthBytes.readUInt32BE(0);
        if (length > stats.size - 4) return;
        const bytes = Buffer.allocUnsafe(length);
        await handle.read(bytes, 0, length, stats.size - 4 - length);
        const footer = JSON.parse(bytes.toString());
        if (footer.format !== CHECKPOINT_FORMAT || footer.segmentOffset > segmentBytes) return;
        this.checkpointMeta = footer;
        this.generation = footer.generation;
        this.nextSequence = footer.nextSequence;
        return footer;
      } finally { await handle.close(); }
    } catch {
      // Missing or invalid experimental checkpoints fall back to log replay.
    }
  }
  applyOverlay(frame, location) {
    if (frame.t === 'd') this.overlay.set(frame.id, null);
    else {
      location.sequence = frame.s;
      this.overlay.set(frame.id, location);
      this.nextSequence = Math.max(this.nextSequence, frame.s + 1);
    }
  }
  async recover() {
    const fileSize = (await fs.stat(this.filePath)).size;
    const checkpoint = await this.readCheckpointFooter(fileSize);
    const baseOffset = checkpoint?.segmentOffset ?? 0;
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
        for (const item of pending) this.applyOverlay(item.frame, item.location);
        pending = [];
        this.generation = frame.generation;
        committedOffset = baseOffset + offset + 4 + length;
      } else pending.push({ frame, location: { offset: baseOffset + offset + 4, length } });
      offset += 4 + length;
    }
    if (committedOffset < fileSize) await fs.truncate(this.filePath, committedOffset);
  }
  async loadShard(key, existingHandle) {
    if (this.shardCache.has(key)) return this.shardCache.get(key);
    const descriptor = this.checkpointMeta?.shards[key];
    if (!descriptor) {
      const empty = new Map();
      this.shardCache.set(key, empty);
      return empty;
    }
    const handle = existingHandle || await fs.open(this.checkpointPath, 'r');
    try {
      const data = Buffer.allocUnsafe(descriptor.length);
      await handle.read(data, 0, data.length, descriptor.offset);
      const shard = new Map(JSON.parse(data.toString()));
      this.shardCache.set(key, shard);
      return shard;
    } finally { if (!existingHandle) await handle.close(); }
  }
  async getLocation(id) {
    if (this.overlay.has(id)) return this.overlay.get(id);
    return (await this.loadShard(this.shardKey(id))).get(id);
  }
  async materializeIndex() {
    const index = new Map();
    const keys = Object.keys(this.checkpointMeta?.shards ?? {});
    const handle = keys.length ? await fs.open(this.checkpointPath, 'r') : undefined;
    try {
      for (const key of keys) {
        for (const [id, location] of await this.loadShard(key, handle)) index.set(id, location);
      }
    } finally { await handle?.close(); }
    for (const [id, location] of this.overlay) {
      if (location === null) index.delete(id);
      else index.set(id, location);
    }
    return index;
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
    const start = (await fs.stat(this.filePath)).size;
    const encoded = frames.map((frame) => ({ frame, data: this.encode(frame) }));
    const generation = this.generation + 1;
    const output = Buffer.concat([...encoded.map(({ data }) => data), this.encode({ t: 'c', generation })]);
    const handle = await fs.open(this.filePath, 'a');
    try { await handle.writeFile(output); await handle.sync(); } finally { await handle.close(); }
    let offset = start;
    for (const item of encoded) {
      this.applyOverlay(item.frame, { offset: offset + 4, length: item.data.length - 4 });
      offset += item.data.length;
    }
    this.generation = generation;
    if (frames.length >= 512) await this.checkpoint(start + output.length);
  }
  async checkpoint(segmentOffset) {
    const index = await this.materializeIndex();
    const grouped = new Map();
    for (const entry of index) {
      const key = this.shardKey(entry[0]);
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }
    const shards = {};
    const payloads = [];
    let offset = 0;
    for (const [key, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
      const payload = Buffer.from(JSON.stringify(entries));
      shards[key] = { offset, length: payload.length };
      payloads.push(payload);
      offset += payload.length;
    }
    const footer = { format: CHECKPOINT_FORMAT, segmentOffset, generation: this.generation, nextSequence: this.nextSequence, shards };
    const footerBytes = Buffer.from(JSON.stringify(footer));
    const footerLength = Buffer.allocUnsafe(4);
    footerLength.writeUInt32BE(footerBytes.length, 0);
    const temporary = `${this.checkpointPath}.tmp`;
    const handle = await fs.open(temporary, 'w');
    try { await handle.writeFile(Buffer.concat([...payloads, footerBytes, footerLength])); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, this.checkpointPath);
    const directory = await fs.open(this.collectionPath, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    this.checkpointMeta = footer;
    this.overlay.clear();
    this.shardCache.clear();
  }
  async read(location, existingHandle) {
    const handle = existingHandle || await fs.open(this.filePath, 'r');
    try {
      const data = Buffer.allocUnsafe(location.length);
      await handle.read(data, 0, data.length, location.offset);
      return JSON.parse(data.toString()).row;
    } finally { if (!existingHandle) await handle.close(); }
  }
  async getRecord(id) {
    this.checkDestroyed();
    await this.initialized;
    const location = await this.getLocation(id);
    return location ? this.read(location) : undefined;
  }
  async getRecords(ids) {
    this.checkDestroyed();
    const rows = new Map();
    for (const id of ids) {
      const row = await this.getRecord(id);
      if (row !== undefined) rows.set(id, row);
    }
    return rows;
  }
  async *iterateRecords() {
    this.checkDestroyed();
    await this.initialized;
    const locations = [...(await this.materializeIndex()).values()].sort((left, right) => left.sequence - right.sequence);
    const handle = await fs.open(this.filePath, 'r');
    let chunkStart = -1;
    let chunk = Buffer.alloc(0);
    try {
      for (const location of locations) {
        if (location.offset < chunkStart || location.offset + location.length > chunkStart + chunk.length) {
          chunkStart = Math.floor(location.offset / SCAN_CHUNK_BYTES) * SCAN_CHUNK_BYTES;
          const length = Math.max(SCAN_CHUNK_BYTES, location.offset + location.length - chunkStart);
          chunk = Buffer.allocUnsafe(length);
          const result = await handle.read(chunk, 0, length, chunkStart);
          chunk = chunk.subarray(0, result.bytesRead);
        }
        const relative = location.offset - chunkStart;
        yield JSON.parse(chunk.subarray(relative, relative + location.length).toString()).row;
      }
    } finally { await handle.close(); }
  }
  async getData() { const rows = []; for await (const row of this.iterateRecords()) rows.push(row); return rows; }
  async insert(rows) { return this.mutateRecords({ puts: rows }); }
  async update(rows) {
    await this.initialized;
    return this.mutateRecords({ deletes: [...(await this.materializeIndex()).keys()], puts: rows });
  }
  async mutateRecords(mutation) {
    this.checkDestroyed();
    assertMutationBound(Math.max(mutation.deletes?.length || 0, mutation.puts?.length || 0));
    return this.queue.add(async () => {
      await this.initialized;
      const deletes = mutation.deletes || [];
      const puts = mutation.puts || [];
      const frames = deletes.map((id) => ({ t: 'd', id }));
      const emptyCollection = !this.checkpointMeta && this.overlay.size === 0 && deletes.length === 0;
      if (emptyCollection) {
        for (const row of puts) frames.push({ t: 'p', id: row._id, s: this.nextSequence++, row });
      } else for (const row of puts) {
          const current = await this.getLocation(row._id);
          frames.push({ t: 'p', id: row._id, s: current?.sequence ?? this.nextSequence++, row });
        }
      await this.append(frames);
    });
  }
  async cacheRevision() { this.checkDestroyed(); await this.initialized; return String(this.generation); }
  async compact() { this.checkDestroyed(); }
  async storageStats() {
    this.checkDestroyed();
    await this.initialized;
    const totalBytes = (await fs.stat(this.filePath)).size;
    return { generation: this.generation, liveBytes: totalBytes, totalBytes, reclaimableBytes: 0, tombstones: 0 };
  }
  async destroy() {
    this.checkDestroyed();
    await this.initialized;
    await fs.rm(this.collectionPath, { recursive: true, force: true });
    this.destroyed = true;
  }
}

module.exports = SegmentAdapter;
