const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { assertMutationBound } = require('../../packages/core/dist/modules/persistence/record-pages');

const MAGIC = Buffer.from('CAMATRL1');
const TRAILER_BYTES = 24;
const FORMAT = 1;
const SCAN_CHUNK_BYTES = 1024 * 1024;

// Experimental only. Data, optional locator checkpoint, commit metadata and
// fixed trailer are published by one append and one fsync.
class EmbeddedSegmentAdapter {
  constructor(config, meta, ignoredFs, logger, collectionName, system, queue) {
    this.collectionPath = path.join(system.getOutputPath(), collectionName);
    this.filePath = path.join(this.collectionPath, 'records.embedded-segment');
    this.queue = queue;
    this.meta = meta;
    this.overlay = new Map();
    this.shardCache = new Map();
    this.checkpointMeta = undefined;
    this.lastTrailerOffset = undefined;
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
  checksum(data) { return crypto.createHash('sha256').update(data).digest().readUInt32BE(0); }
  async initialize() {
    await this.meta.get();
    await fs.mkdir(this.collectionPath, { recursive: true });
    const handle = await fs.open(this.filePath, 'a+');
    await handle.close();
    await this.recover();
  }
  encodeFrame(frame) {
    const payload = Buffer.from(JSON.stringify(frame));
    const output = Buffer.allocUnsafe(payload.length + 4);
    output.writeUInt32BE(payload.length, 0);
    payload.copy(output, 4);
    return output;
  }
  encodeTrailer(footerOffset, footer) {
    const trailer = Buffer.allocUnsafe(TRAILER_BYTES);
    MAGIC.copy(trailer, 0);
    trailer.writeBigUInt64BE(BigInt(footerOffset), 8);
    trailer.writeUInt32BE(footer.length, 16);
    trailer.writeUInt32BE(this.checksum(footer), 20);
    return trailer;
  }
  async readFooterAt(trailerOffset, existingHandle) {
    if (trailerOffset < 0) return;
    const handle = existingHandle || await fs.open(this.filePath, 'r');
    try {
      const trailer = Buffer.allocUnsafe(TRAILER_BYTES);
      const trailerRead = await handle.read(trailer, 0, trailer.length, trailerOffset);
      if (trailerRead.bytesRead !== TRAILER_BYTES || !trailer.subarray(0, 8).equals(MAGIC)) return;
      const footerOffset = Number(trailer.readBigUInt64BE(8));
      const footerLength = trailer.readUInt32BE(16);
      if (footerOffset + footerLength !== trailerOffset) return;
      const footerBytes = Buffer.allocUnsafe(footerLength);
      const footerRead = await handle.read(footerBytes, 0, footerLength, footerOffset);
      if (footerRead.bytesRead !== footerLength || this.checksum(footerBytes) !== trailer.readUInt32BE(20)) return;
      const footer = JSON.parse(footerBytes.toString());
      if (footer.format !== FORMAT) return;
      return { footer, trailerOffset };
    } finally { if (!existingHandle) await handle.close(); }
  }
  async findLatestFooter(fileSize) {
    if (fileSize < TRAILER_BYTES) return;
    const direct = await this.readFooterAt(fileSize - TRAILER_BYTES);
    if (direct) return direct;
    // Slow recovery path only: locate the last checksummed trailer before a torn tail.
    const data = await fs.readFile(this.filePath);
    let cursor = data.lastIndexOf(MAGIC);
    while (cursor >= 0) {
      const candidate = await this.readFooterAt(cursor);
      if (candidate) return candidate;
      cursor = data.lastIndexOf(MAGIC, cursor - 1);
    }
  }
  applyOverlay(frame, location) {
    if (frame.t === 'd') this.overlay.set(frame.id, null);
    else this.overlay.set(frame.id, { ...location, sequence: frame.s });
  }
  async applyFrames(start, end) {
    if (end <= start) return;
    const handle = await fs.open(this.filePath, 'r');
    const data = Buffer.allocUnsafe(end - start);
    try { await handle.read(data, 0, data.length, start); } finally { await handle.close(); }
    let offset = 0;
    while (offset < data.length) {
      const length = data.readUInt32BE(offset);
      const frame = JSON.parse(data.subarray(offset + 4, offset + 4 + length).toString());
      this.applyOverlay(frame, { offset: start + offset + 4, length });
      offset += 4 + length;
    }
  }
  async recover() {
    const fileSize = (await fs.stat(this.filePath)).size;
    const latest = await this.findLatestFooter(fileSize);
    if (!latest) {
      if (fileSize) await fs.truncate(this.filePath, 0);
      return;
    }
    const committedEnd = latest.trailerOffset + TRAILER_BYTES;
    if (committedEnd < fileSize) await fs.truncate(this.filePath, committedEnd);
    const commits = [latest];
    if (!latest.footer.checkpoint) {
      let cursor = latest;
      const handle = await fs.open(this.filePath, 'r');
      try {
        while (cursor.footer.previousTrailer !== null) {
          cursor = await this.readFooterAt(cursor.footer.previousTrailer, handle);
          if (!cursor) break;
          commits.push(cursor);
          if (cursor.footer.checkpoint) break;
        }
      } finally { await handle.close(); }
    }
    const base = commits[commits.length - 1];
    if (base?.footer.checkpoint) this.checkpointMeta = base.footer.checkpoint;
    for (const commit of commits.reverse()) {
      if (commit === base && base.footer.checkpoint) continue;
      await this.applyFrames(commit.footer.framesStart, commit.footer.framesEnd);
    }
    this.lastTrailerOffset = latest.trailerOffset;
    this.generation = latest.footer.generation;
    this.nextSequence = latest.footer.nextSequence;
  }
  async loadShard(key, existingHandle) {
    if (this.shardCache.has(key)) return this.shardCache.get(key);
    const descriptor = this.checkpointMeta?.shards[key];
    if (!descriptor) {
      const empty = new Map();
      this.shardCache.set(key, empty);
      return empty;
    }
    const handle = existingHandle || await fs.open(this.filePath, 'r');
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
    const handle = keys.length ? await fs.open(this.filePath, 'r') : undefined;
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
  encodeCheckpoint(index, startOffset) {
    const grouped = new Map();
    for (const entry of index) {
      const key = this.shardKey(entry[0]);
      const entries = grouped.get(key) ?? [];
      entries.push(entry);
      grouped.set(key, entries);
    }
    const shards = {};
    const payloads = [];
    let offset = startOffset;
    for (const [key, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
      const payload = Buffer.from(JSON.stringify(entries));
      shards[key] = { offset, length: payload.length };
      payloads.push(payload);
      offset += payload.length;
    }
    return { payloads, checkpoint: { shards } };
  }
  async append(frames) {
    if (!frames.length) return;
    const start = (await fs.stat(this.filePath)).size;
    const encoded = frames.map((frame) => ({ frame, data: this.encodeFrame(frame) }));
    let offset = start;
    const changes = [];
    for (const item of encoded) {
      changes.push({ frame: item.frame, location: { offset: offset + 4, length: item.data.length - 4, sequence: item.frame.s } });
      offset += item.data.length;
    }
    const framesEnd = offset;
    let checkpoint;
    let checkpointPayloads = [];
    if (frames.length >= 512) {
      const next = await this.materializeIndex();
      for (const change of changes) {
        if (change.frame.t === 'd') next.delete(change.frame.id);
        else next.set(change.frame.id, change.location);
      }
      const encodedCheckpoint = this.encodeCheckpoint(next, framesEnd);
      checkpoint = encodedCheckpoint.checkpoint;
      checkpointPayloads = encodedCheckpoint.payloads;
      offset += checkpointPayloads.reduce((total, payload) => total + payload.length, 0);
    }
    const generation = this.generation + 1;
    const footer = Buffer.from(JSON.stringify({
      format: FORMAT,
      generation,
      nextSequence: this.nextSequence,
      previousTrailer: this.lastTrailerOffset ?? null,
      framesStart: start,
      framesEnd,
      checkpoint,
    }));
    const trailerOffset = offset + footer.length;
    const trailer = this.encodeTrailer(offset, footer);
    const output = Buffer.concat([...encoded.map(({ data }) => data), ...checkpointPayloads, footer, trailer]);
    const handle = await fs.open(this.filePath, 'a');
    try { await handle.writeFile(output); await handle.sync(); } finally { await handle.close(); }
    this.generation = generation;
    this.lastTrailerOffset = trailerOffset;
    if (checkpoint) {
      this.checkpointMeta = checkpoint;
      this.overlay.clear();
      this.shardCache.clear();
    } else for (const change of changes) this.applyOverlay(change.frame, change.location);
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

module.exports = EmbeddedSegmentAdapter;
