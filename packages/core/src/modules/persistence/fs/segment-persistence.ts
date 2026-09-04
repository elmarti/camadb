import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { FileHandle } from 'fs/promises';
import * as path from 'path';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { IFS } from '../../../interfaces/fs.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import {
  IPersistenceAdapter,
  RecordMutation,
  StorageStats,
} from '../../../interfaces/persistence-adapter.interface';
import { IQueueService } from '../../../interfaces/queue-service.interface';
import { ISystem } from '../../../interfaces/system.interface';
import { assertMutationBound, MAX_PAGE_BYTES } from '../record-pages';
import { shouldCompact } from '../compaction';

const MAGIC = Buffer.from('CAMATRL3');
const TRAILER_BYTES = 24;
const FORMAT = 3;
const SCAN_CHUNK_BYTES = 1024 * 1024;
const MAX_FOOTER_BYTES = 1024 * 1024;

interface RecordLocation { offset: number; length: number; sequence: number }
interface CheckpointDescriptor { offset: number; length: number }
interface Checkpoint { shards: Record<string, CheckpointDescriptor> }
interface SegmentFooter {
  format: number;
  generation: number;
  nextSequence: number;
  previousTrailer: number | null;
  framesStart: number;
  framesEnd: number;
  tailCommits?: number;
  reclaimableBytes?: number;
  tombstones?: number;
  incarnation: string;
  checkpoint?: Checkpoint;
}
interface FooterLocation { footer: SegmentFooter; trailerOffset: number }
type SegmentFrame =
  | { t: 'd'; id: string }
  | { t: 'p'; id: string; s: number; row: any };

// Data, optional locator checkpoint, commit metadata and a fixed trailer are
// published by one append and one file sync.
export default class SegmentPersistence implements IPersistenceAdapter {
  private static readonly readers = new Map<string, number>();
  private static readonly writers = new Map<string, IQueueService>();
  private static readonly revisions = new Map<string, number>();
  private readonly collectionPath: string;
  private readonly filePath: string;
  private readonly overlay = new Map<string, RecordLocation | null>();
  private readonly shardCache = new Map<string, Map<string, RecordLocation>>();
  private checkpointMeta?: Checkpoint;
  private lastTrailerOffset?: number;
  private generation = 0;
  private nextSequence = 0;
  private tailCommits = 0;
  private observedRevision = 0;
  private reclaimableBytes = 0;
  private tombstones = 0;
  private lastCompactionError?: string;
  private incarnation = `${Date.now()}-${Math.random()}`;
  private destroyed = false;
  private readonly initialized: Promise<void>;
  constructor(
    private config: ICamaConfig,
    private meta: ICollectionMeta,
    private legacyFs: IFS,
    _logger: ILogger,
    private collectionName: string,
    private system: ISystem,
    private queue: IQueueService,
  ) {
    this.collectionPath = path.join(system.getOutputPath(), collectionName);
    this.filePath = path.join(this.collectionPath, 'records.segment');
    const existingQueue = SegmentPersistence.writers.get(this.collectionPath);
    if (existingQueue) this.queue = existingQueue;
    else SegmentPersistence.writers.set(this.collectionPath, this.queue);
    this.meta = meta;
    this.overlay = new Map();
    this.shardCache = new Map();
    this.checkpointMeta = undefined;
    this.lastTrailerOffset = undefined;
    this.generation = 0;
    this.nextSequence = 0;
    this.tailCommits = 0;
    this.destroyed = false;
    this.initialized = this.queue.add(() => this.initialize());
  }
  checkDestroyed() {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
  shardKey(id: string): string {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    return (hash >>> 24).toString(16).padStart(2, '0');
  }
  checksum(data: Buffer): number {
    return createHash('sha256').update(data).digest().readUInt32BE(0);
  }
  async initialize() {
    await this.meta.get();
    await fs.mkdir(this.collectionPath, { recursive: true });
    const segmentExists = await this.legacyFs.exists(this.filePath);
    if (!segmentExists || (await fs.stat(this.filePath)).size === 0) {
      const pageManifest = path.join(this.collectionPath, 'manifest.json');
      if (await this.legacyFs.exists(pageManifest)) {
        throw new Error(`Collection "${this.collectionName}" requires explicit migration to segment storage`);
      }
      const legacyPath = path.join(this.collectionPath, 'data');
      if (await this.legacyFs.exists(legacyPath)) {
        const legacy = await this.legacyFs.readData<any[]>(legacyPath);
        if (legacy.length > 0) {
          throw new Error(`Collection "${this.collectionName}" requires explicit migration to segment storage`);
        }
      }
    }
    if (segmentExists) await this.recover();
    else this.observedRevision = SegmentPersistence.revisions.get(this.collectionPath) ?? 0;
  }
  async refresh(): Promise<void> {
    await this.initialized;
    const revision = SegmentPersistence.revisions.get(this.collectionPath) ?? 0;
    if (revision !== this.observedRevision) await this.recover();
  }
  private publishRevision(): void {
    const revision = (SegmentPersistence.revisions.get(this.collectionPath) ?? 0) + 1;
    SegmentPersistence.revisions.set(this.collectionPath, revision);
    this.observedRevision = revision;
  }
  encodeFrame(frame: SegmentFrame): Buffer {
    const payload = Buffer.from(JSON.stringify(frame));
    if (payload.length > MAX_PAGE_BYTES && frame.t === 'p') {
      throw new Error(`Record exceeds the ${MAX_PAGE_BYTES}-byte storage page limit`);
    }
    const output = Buffer.allocUnsafe(payload.length + 4);
    output.writeUInt32BE(payload.length, 0);
    payload.copy(output, 4);
    return output;
  }
  encodeTrailer(footerOffset: number, footer: Buffer): Buffer {
    const trailer = Buffer.allocUnsafe(TRAILER_BYTES);
    MAGIC.copy(trailer, 0);
    trailer.writeBigUInt64BE(BigInt(footerOffset), 8);
    trailer.writeUInt32BE(footer.length, 16);
    trailer.writeUInt32BE(this.checksum(footer), 20);
    return trailer;
  }
  async readFooterAt(trailerOffset: number, existingHandle?: FileHandle): Promise<FooterLocation | undefined> {
    if (trailerOffset < 0) return;
    const handle = existingHandle || await fs.open(this.filePath, 'r');
    try {
      const trailer = Buffer.allocUnsafe(TRAILER_BYTES);
      const trailerRead = await handle.read(trailer, 0, trailer.length, trailerOffset);
      if (trailerRead.bytesRead !== TRAILER_BYTES || !trailer.subarray(0, 8).equals(MAGIC)) return;
      const footerOffset = Number(trailer.readBigUInt64BE(8));
      const footerLength = trailer.readUInt32BE(16);
      if (footerLength > MAX_FOOTER_BYTES || footerOffset < 0 || footerOffset + footerLength !== trailerOffset) return;
      const footerBytes = Buffer.allocUnsafe(footerLength);
      const footerRead = await handle.read(footerBytes, 0, footerLength, footerOffset);
      if (footerRead.bytesRead !== footerLength || this.checksum(footerBytes) !== trailer.readUInt32BE(20)) return;
      let footer: SegmentFooter;
      try { footer = JSON.parse(footerBytes.toString()) as SegmentFooter; } catch { return; }
      if (
        footer.format !== FORMAT ||
        typeof footer.incarnation !== 'string' ||
        !Number.isSafeInteger(footer.generation) ||
        !Number.isSafeInteger(footer.nextSequence) ||
        !Number.isSafeInteger(footer.framesStart) ||
        !Number.isSafeInteger(footer.framesEnd) ||
        footer.framesStart < 0 ||
        footer.framesEnd < footer.framesStart ||
        footer.framesEnd > footerOffset
      ) return;
      return { footer, trailerOffset };
    } finally { if (!existingHandle) await handle.close(); }
  }
  async findLatestFooter(fileSize: number): Promise<FooterLocation | undefined> {
    if (fileSize < TRAILER_BYTES) return;
    const direct = await this.readFooterAt(fileSize - TRAILER_BYTES);
    if (direct) return direct;
    // Slow recovery path only: scan backwards with bounded memory for the last
    // checksummed trailer before a torn tail.
    const handle = await fs.open(this.filePath, 'r');
    const overlap = MAGIC.length - 1;
    let end = fileSize;
    try {
      while (end > 0) {
        const start = Math.max(0, end - SCAN_CHUNK_BYTES);
        const data = Buffer.allocUnsafe(end - start);
        const result = await handle.read(data, 0, data.length, start);
        let cursor = data.subarray(0, result.bytesRead).lastIndexOf(MAGIC);
        while (cursor >= 0) {
          const candidate = await this.readFooterAt(start + cursor, handle);
          if (candidate) return candidate;
          cursor = data.lastIndexOf(MAGIC, cursor - 1);
        }
        if (start === 0) break;
        end = start + overlap;
      }
    } finally { await handle.close(); }
  }
  applyOverlay(frame: SegmentFrame, location: Omit<RecordLocation, 'sequence'>): void {
    if (frame.t === 'd') this.overlay.set(frame.id, null);
    else this.overlay.set(frame.id, { ...location, sequence: frame.s });
  }
  async applyFrames(start: number, end: number): Promise<void> {
    if (end <= start) return;
    const handle = await fs.open(this.filePath, 'r');
    let offset = start;
    try {
      while (offset < end) {
        const header = Buffer.allocUnsafe(4);
        const headerRead = await handle.read(header, 0, header.length, offset);
        if (headerRead.bytesRead !== 4) throw new Error('Invalid segment frame header');
        const length = header.readUInt32BE(0);
        if (length > MAX_PAGE_BYTES + 1024 || offset + 4 + length > end) {
          throw new Error('Invalid segment frame length');
        }
        const data = Buffer.allocUnsafe(length);
        const frameRead = await handle.read(data, 0, length, offset + 4);
        if (frameRead.bytesRead !== length) throw new Error('Incomplete segment frame');
        const frame = JSON.parse(data.toString()) as SegmentFrame;
        this.applyOverlay(frame, { offset: offset + 4, length });
        offset += 4 + length;
      }
    } finally { await handle.close(); }
  }
  async recover() {
    this.overlay.clear();
    this.shardCache.clear();
    this.checkpointMeta = undefined;
    this.lastTrailerOffset = undefined;
    this.generation = 0;
    this.nextSequence = 0;
    this.tailCommits = 0;
    this.reclaimableBytes = 0;
    this.tombstones = 0;
    if (!(await this.legacyFs.exists(this.filePath))) {
      this.observedRevision = SegmentPersistence.revisions.get(this.collectionPath) ?? 0;
      return;
    }
    const fileSize = (await fs.stat(this.filePath)).size;
    const latest = await this.findLatestFooter(fileSize);
    if (!latest) {
      if (fileSize) await fs.truncate(this.filePath, 0);
      this.observedRevision = SegmentPersistence.revisions.get(this.collectionPath) ?? 0;
      return;
    }
    const committedEnd = latest.trailerOffset + TRAILER_BYTES;
    if (committedEnd < fileSize) await fs.truncate(this.filePath, committedEnd);
    const commits = [latest];
    if (!latest.footer.checkpoint) {
      let cursor: FooterLocation | undefined = latest;
      const handle = await fs.open(this.filePath, 'r');
      try {
        while (cursor && cursor.footer.previousTrailer !== null) {
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
    this.tailCommits = latest.footer.tailCommits ?? commits.length - 1;
    this.reclaimableBytes = latest.footer.reclaimableBytes ?? 0;
    this.tombstones = latest.footer.tombstones ?? 0;
    this.incarnation = latest.footer.incarnation;
    this.observedRevision = SegmentPersistence.revisions.get(this.collectionPath) ?? 0;
  }
  async loadShard(key: string, existingHandle?: FileHandle): Promise<Map<string, RecordLocation>> {
    const cached = this.shardCache.get(key);
    if (cached) return cached;
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
      const shard = new Map<string, RecordLocation>(JSON.parse(data.toString()));
      this.shardCache.set(key, shard);
      return shard;
    } finally { if (!existingHandle) await handle.close(); }
  }
  async getLocation(id: string): Promise<RecordLocation | null | undefined> {
    if (this.overlay.has(id)) return this.overlay.get(id);
    return (await this.loadShard(this.shardKey(id))).get(id);
  }
  async materializeIndex(): Promise<Map<string, RecordLocation>> {
    const index = new Map<string, RecordLocation>();
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
  encodeCheckpoint(index: Map<string, RecordLocation>, startOffset: number): {
    payloads: Buffer[];
    checkpoint: Checkpoint;
  } {
    const grouped = new Map<string, Array<[string, RecordLocation]>>();
    for (const entry of index) {
      const key = this.shardKey(entry[0]);
      const entries = grouped.get(key) ?? [];
      entries.push(entry);
      grouped.set(key, entries);
    }
    const shards: Record<string, CheckpointDescriptor> = {};
    const payloads: Buffer[] = [];
    let offset = startOffset;
    for (const [key, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
      const payload = Buffer.from(JSON.stringify(entries));
      shards[key] = { offset, length: payload.length };
      payloads.push(payload);
      offset += payload.length;
    }
    return { payloads, checkpoint: { shards } };
  }
  async append(frames: SegmentFrame[]): Promise<void> {
    if (!frames.length) return;
    const creating = !(await this.legacyFs.exists(this.filePath));
    const start = creating ? 0 : (await fs.stat(this.filePath)).size;
    const encoded = frames.map((frame) => ({ frame, data: this.encodeFrame(frame) }));
    let offset = start;
    const changes: Array<{ frame: SegmentFrame; location: RecordLocation }> = [];
    for (const item of encoded) {
      changes.push({
        frame: item.frame,
        location: {
          offset: offset + 4,
          length: item.data.length - 4,
          sequence: item.frame.t === 'p' ? item.frame.s : -1,
        },
      });
      offset += item.data.length;
    }
    const framesEnd = offset;
    let checkpoint;
    let checkpointPayloads: Buffer[] = [];
    if (frames.length >= 512 || this.tailCommits >= 255) {
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
      tailCommits: checkpoint ? 0 : this.tailCommits + 1,
      reclaimableBytes: this.reclaimableBytes,
      tombstones: this.tombstones,
      incarnation: this.incarnation,
      checkpoint,
    }));
    const trailerOffset = offset + footer.length;
    const trailer = this.encodeTrailer(offset, footer);
    const output = Buffer.concat([...encoded.map(({ data }) => data), ...checkpointPayloads, footer, trailer]);
    const handle = await fs.open(this.filePath, 'a');
    try { await handle.writeFile(output); await handle.sync(); } finally { await handle.close(); }
    if (creating) await this.syncContainingDirectory();
    this.generation = generation;
    this.tailCommits = checkpoint ? 0 : this.tailCommits + 1;
    this.lastTrailerOffset = trailerOffset;
    if (checkpoint) {
      this.checkpointMeta = checkpoint;
      this.overlay.clear();
      this.shardCache.clear();
    } else for (const change of changes) this.applyOverlay(change.frame, change.location);
    this.publishRevision();
  }
  async read(location: RecordLocation, existingHandle?: FileHandle): Promise<any> {
    const handle = existingHandle || await fs.open(this.filePath, 'r');
    try {
      const data = Buffer.allocUnsafe(location.length);
      await handle.read(data, 0, data.length, location.offset);
      return JSON.parse(data.toString()).row;
    } finally { if (!existingHandle) await handle.close(); }
  }
  async getRecord(id: string): Promise<any | undefined> {
    this.checkDestroyed();
    this.pinReader(1);
    try {
      await this.refresh();
      const location = await this.getLocation(id);
      return location ? this.read(location) : undefined;
    } finally { this.pinReader(-1); }
  }
  async getRecords(ids: string[]): Promise<Map<string, any>> {
    this.checkDestroyed();
    this.pinReader(1);
    try {
      await this.refresh();
      const rows = new Map<string, any>();
      for (const id of ids) {
        const location = await this.getLocation(id);
        const row = location ? await this.read(location) : undefined;
        if (row !== undefined) rows.set(id, row);
      }
      return rows;
    } finally { this.pinReader(-1); }
  }
  async *iterateRecords(): AsyncIterable<any> {
    this.checkDestroyed();
    this.pinReader(1);
    let handle: FileHandle | undefined;
    try {
      await this.refresh();
      const locations = [...(await this.materializeIndex()).values()]
        .sort((left, right) => left.sequence - right.sequence);
      if (locations.length === 0) return;
      handle = await fs.open(this.filePath, 'r');
      let chunkStart = -1;
      let chunk = Buffer.alloc(0);
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
    } finally {
      await handle?.close();
      this.pinReader(-1);
    }
  }
  async getData(): Promise<any[]> { const rows = []; for await (const row of this.iterateRecords()) rows.push(row); return rows; }
  async insert(rows: any[]): Promise<void> { return this.mutateRecords({ puts: rows }); }
  async update(rows: any[]): Promise<void> {
    this.checkDestroyed();
    assertMutationBound(rows.length);
    return this.queue.add(async () => {
      await this.initialized;
      this.checkDestroyed();
      await this.refresh();
      try {
        await this.mutateNow({ deletes: [...(await this.materializeIndex()).keys()], puts: rows });
      } catch (error) {
        await this.recover();
        throw error;
      }
    });
  }
  async mutateRecords(mutation: RecordMutation): Promise<void> {
    this.checkDestroyed();
    assertMutationBound(Math.max(mutation.deletes?.length || 0, mutation.puts?.length || 0));
    return this.queue.add(async () => {
      await this.initialized;
      this.checkDestroyed();
      await this.refresh();
      try {
        await this.mutateNow(mutation);
      } catch (error) {
        await this.recover();
        throw error;
      }
    });
  }
  private async mutateNow(mutation: RecordMutation): Promise<void> {
    const deletes = mutation.deletes || [];
    const puts = mutation.puts || [];
    const frames: SegmentFrame[] = [];
    for (const id of deletes) {
      const current = await this.getLocation(id);
      if (current) {
        this.reclaimableBytes += current.length + 4;
        this.tombstones += 1;
      }
      frames.push({ t: 'd', id });
      this.reclaimableBytes += this.encodeFrame({ t: 'd', id }).length;
    }
    const emptyCollection = !this.checkpointMeta && this.overlay.size === 0 && deletes.length === 0;
    if (emptyCollection) {
      for (const row of puts) {
        const sequence = this.nextSequence++;
        const id = typeof row?._id === 'string' ? row._id : `legacy-${this.generation + 1}-${sequence}`;
        frames.push({ t: 'p', id, s: sequence, row });
      }
    } else for (const row of puts) {
        const explicitId = typeof row?._id === 'string' ? row._id : undefined;
        const current = explicitId ? await this.getLocation(explicitId) : undefined;
        if (current) this.reclaimableBytes += current.length + 4;
        const sequence = current?.sequence ?? this.nextSequence++;
        const id = explicitId ?? `legacy-${this.generation + 1}-${sequence}`;
        frames.push({ t: 'p', id, s: sequence, row });
      }
    if (this.generation > 0) this.reclaimableBytes += 256;
    await this.append(frames);
    await this.autoCompact();
  }
  async cacheRevision(): Promise<string> {
    this.checkDestroyed();
    await this.refresh();
    return `${this.incarnation}:${this.generation}`;
  }
  async compact(): Promise<void> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      await this.initialized;
      this.checkDestroyed();
      await this.refresh();
      await this.compactNow();
    });
  }
  async storageStats(): Promise<StorageStats> {
    this.checkDestroyed();
    await this.refresh();
    if (!(await this.legacyFs.exists(this.filePath))) {
      return {
        generation: this.generation,
        liveBytes: 0,
        totalBytes: 0,
        reclaimableBytes: 0,
        tombstones: 0,
        lastCompactionError: this.lastCompactionError,
      };
    }
    const totalBytes = (await fs.stat(this.filePath)).size;
    const reclaimableBytes = Math.min(this.reclaimableBytes, totalBytes);
    return {
      generation: this.generation,
      liveBytes: totalBytes - reclaimableBytes,
      totalBytes,
      reclaimableBytes,
      tombstones: this.tombstones,
      lastCompactionError: this.lastCompactionError,
    };
  }
  private async autoCompact(): Promise<void> {
    const minimum = this.config.compaction?.minReclaimableBytes ?? 16 * 1024 * 1024;
    if (this.reclaimableBytes < minimum) return;
    try {
      const stats = await this.storageStats();
      if (shouldCompact(stats, this.config)) await this.compactNow();
    } catch (error) {
      this.lastCompactionError = error instanceof Error ? error.message : 'Compaction failed';
    }
  }
  private async compactNow(): Promise<void> {
    if ((SegmentPersistence.readers.get(this.collectionPath) ?? 0) > 0) return;
    if (!(await this.legacyFs.exists(this.filePath))) return;
    const current = [...(await this.materializeIndex()).entries()]
      .sort((left, right) => left[1].sequence - right[1].sequence);
    const temporaryPath = `${this.filePath}.compact`;
    const source = await fs.open(this.filePath, 'r');
    let destination: FileHandle | undefined;
    let renamed = false;
    try {
      destination = await fs.open(temporaryPath, 'w');
      const next = new Map<string, RecordLocation>();
      let offset = 0;
      let buffered: Buffer[] = [];
      let bufferedBytes = 0;
      const flush = async () => {
        if (!buffered.length) return;
        await destination?.write(Buffer.concat(buffered));
        buffered = [];
        bufferedBytes = 0;
      };
      for (const [id, location] of current) {
        const row = await this.read(location, source);
        const frame = this.encodeFrame({ t: 'p', id, s: location.sequence, row });
        next.set(id, { offset: offset + 4, length: frame.length - 4, sequence: location.sequence });
        buffered.push(frame);
        bufferedBytes += frame.length;
        offset += frame.length;
        if (bufferedBytes >= SCAN_CHUNK_BYTES) await flush();
      }
      await flush();
      const framesEnd = offset;
      const encodedCheckpoint = this.encodeCheckpoint(next, offset);
      for (const payload of encodedCheckpoint.payloads) {
        await destination.write(payload);
        offset += payload.length;
      }
      const generation = this.generation + 1;
      const footer = Buffer.from(JSON.stringify({
        format: FORMAT,
        generation,
        nextSequence: this.nextSequence,
        previousTrailer: null,
        framesStart: 0,
        framesEnd,
        tailCommits: 0,
        reclaimableBytes: 0,
        tombstones: 0,
        incarnation: this.incarnation,
        checkpoint: encodedCheckpoint.checkpoint,
      } satisfies SegmentFooter));
      const trailerOffset = offset + footer.length;
      await destination.write(footer);
      await destination.write(this.encodeTrailer(offset, footer));
      await destination.sync();
      await destination.close();
      destination = undefined;
      await fs.rename(temporaryPath, this.filePath);
      renamed = true;
      await this.syncContainingDirectory();
      this.checkpointMeta = encodedCheckpoint.checkpoint;
      this.overlay.clear();
      this.shardCache.clear();
      this.lastTrailerOffset = trailerOffset;
      this.generation = generation;
      this.tailCommits = 0;
      this.reclaimableBytes = 0;
      this.tombstones = 0;
      this.lastCompactionError = undefined;
      this.publishRevision();
    } catch (error) {
      await destination?.close().catch(() => undefined);
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      if (renamed) {
        this.publishRevision();
        await this.recover().catch(() => undefined);
      }
      throw error;
    } finally { await source.close(); }
  }
  private async syncContainingDirectory(): Promise<void> {
    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(this.collectionPath, 'r');
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !['EINVAL', 'ENOTSUP', 'ENOSYS', 'EISDIR'].includes(code)) throw error;
    } finally { await handle?.close(); }
  }
  async destroy(): Promise<void> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      await this.initialized;
      this.checkDestroyed();
      await fs.rm(this.collectionPath, { recursive: true, force: true });
      this.publishRevision();
      this.destroyed = true;
    });
  }
  private pinReader(delta: number): void {
    const count = (SegmentPersistence.readers.get(this.collectionPath) ?? 0) + delta;
    if (count === 0) SegmentPersistence.readers.delete(this.collectionPath);
    else SegmentPersistence.readers.set(this.collectionPath, count);
  }
}
