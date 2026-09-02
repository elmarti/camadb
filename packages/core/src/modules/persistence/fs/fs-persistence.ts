import * as path from 'path';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { IFS } from '../../../interfaces/fs.interface';
import { IPersistenceAdapter, RecordMutation, StorageStats } from '../../../interfaces/persistence-adapter.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { IQueueService } from '../../../interfaces/queue-service.interface';
import { ISystem } from '../../../interfaces/system.interface';
import { assertMutationBound, chunkRecords } from '../record-pages';
import { shouldCompact } from '../compaction';

interface RecordLocation {
  index: number;
  page: string;
  sequence: number;
}
interface RecordShard {
  records: Record<string, RecordLocation>;
  tombstones: Record<string, number>;
}
interface RecordManifest {
  incarnation?: string;
  camaDB: { format: 'records'; version: 3 };
  generation: number;
  nextSequence: number;
  shards: Record<string, string>;
}
interface PreparedRecord {
  id: string;
  row: any;
}

const emptyManifest = (): RecordManifest => ({
  incarnation: `${Date.now()}-${Math.random()}`,
  camaDB: { format: 'records', version: 3 },
  generation: 0,
  nextSequence: 0,
  shards: {},
});
const emptyShard = (): RecordShard => ({ records: {}, tombstones: {} });

/** Immutable filesystem pages with a fixed-fanout, copy-on-write locator index. */
export default class FSPersistence implements IPersistenceAdapter {
  private static readers = new Map<string, number>();
  private static writers = new Map<string, IQueueService>();
  private destroyed = false;
  private lastCompactionError?: string;
  private compactionDebt = Infinity;
  private readonly collectionPath: string;
  private readonly pagesPath: string;
  private readonly shardsPath: string;
  private readonly manifestPath: string;
  private readonly initialized: Promise<void>;

  constructor(
    private config: ICamaConfig,
    private collectionMeta: ICollectionMeta,
    private fs: IFS,
    private logger: ILogger,
    private collectionName: string,
    private system: ISystem,
    private queue: IQueueService,
  ) {
    this.collectionPath = path.join(this.system.getOutputPath(), this.collectionName);
    this.pagesPath = path.join(this.collectionPath, 'pages');
    this.shardsPath = path.join(this.collectionPath, 'shards');
    this.manifestPath = path.join(this.collectionPath, 'manifest.json');
    const existingQueue = FSPersistence.writers.get(this.collectionPath);
    if (existingQueue) this.queue = existingQueue;
    else FSPersistence.writers.set(this.collectionPath, this.queue);
    this.initialized = this.queue.add(() => this.initialize());
  }

  async insert(rows: any[]): Promise<void> {
    await this.mutateRecords({ puts: rows });
  }

  async getData(): Promise<any[]> {
    const rows: any[] = [];
    for await (const row of this.iterateRecords()) rows.push(row);
    return rows;
  }

  async getRecord(id: string): Promise<any | undefined> {
    return (await this.getRecords([id])).get(id);
  }

  async cacheRevision(): Promise<string> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = await this.readManifest();
    return manifest.incarnation ? `${manifest.incarnation}:${manifest.generation}` : JSON.stringify(manifest);
  }

  async getRecords(ids: string[]): Promise<Map<string, any>> {
    this.pinReader(1);
    try {
      return await this.readRecordsSnapshot(ids);
    } finally {
      this.pinReader(-1);
    }
  }

  private async readRecordsSnapshot(ids: string[]): Promise<Map<string, any>> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = await this.readManifest();
    const shards = new Map<string, RecordShard>();
    const pages = new Map<string, any[]>();
    const result = new Map<string, any>();
    for (const id of ids) {
      const shardKey = this.shardKey(id);
      let shard = shards.get(shardKey);
      if (!shard) {
        shard = await this.readShard(manifest, shardKey);
        shards.set(shardKey, shard);
      }
      const location = shard.records[id];
      if (!location) continue;
      let page = pages.get(location.page);
      if (!page) {
        page = await this.readPage(location.page);
        pages.set(location.page, page);
      }
      result.set(id, page[location.index]);
    }
    return result;
  }

  async *iterateRecords(): AsyncIterable<any> {
    this.pinReader(1);
    try {
      yield* this.iterateSnapshot();
    } finally {
      this.pinReader(-1);
    }
  }

  private async *iterateSnapshot(): AsyncIterable<any> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = await this.readManifest();
    const locations: RecordLocation[] = [];
    for (const shardFile of Object.values(manifest.shards)) {
      locations.push(
        ...Object.values((await this.fs.loadJSON<RecordShard>(path.join(this.shardsPath, shardFile))).records),
      );
    }
    locations.sort((left, right) => left.sequence - right.sequence);
    let loadedPage: string | undefined;
    let page: any[] = [];
    for (const location of locations) {
      if (loadedPage !== location.page) {
        loadedPage = location.page;
        page = await this.readPage(location.page);
      }
      yield page[location.index];
    }
  }

  async mutateRecords(mutation: RecordMutation): Promise<void> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      await this.initialized;
      await this.applyMutation(await this.readManifest(), mutation);
      await this.autoCompact();
    });
  }

  async update(updated: any[]): Promise<void> {
    this.checkDestroyed();
    return this.queue.add(async () => {
      await this.initialized;
      const current = await this.readManifest();
      await this.writeReplacement(current.generation + 1, updated);
      this.compactionDebt = Infinity;
      await this.autoCompact();
    });
  }

  async compact(): Promise<void> {
    this.checkDestroyed();
    return this.queue.add(() => this.compactNow());
  }

  private async compactNow(): Promise<void> {
    await this.initialized;
    const current = await this.readManifest();
    const replacement = { ...emptyManifest(), generation: current.generation + 1 };
    const shards = new Map<string, RecordShard>();
    let batch: PreparedRecord[] = [];
    let sequence = 0;
    for await (const row of this.iterateRecords()) {
      const id = typeof row?._id === 'string' ? row._id : `legacy-${replacement.generation}-${sequence++}`;
      if (!shards.has(this.shardKey(id))) shards.set(this.shardKey(id), emptyShard());
      batch.push({ id, row });
      if (batch.length === 512) {
        await this.writePages(batch, replacement, shards);
        batch = [];
      }
    }
    if (batch.length) await this.writePages(batch, replacement, shards);
    for (const [key, shard] of shards) {
      const file = `shard-${key}-${replacement.generation}-${this.nonce()}.json`;
      await this.fs.writeJSON(this.shardsPath, file, shard);
      replacement.shards[key] = file;
    }
    await this.fs.writeJSON(this.collectionPath, 'manifest.json', replacement);
    if ((FSPersistence.readers.get(this.collectionPath) ?? 0) > 0) return;
    const manifest = await this.readManifest();
    const livePages = new Set<string>();
    for (const shardFile of Object.values(manifest.shards)) {
      const shard = await this.fs.loadJSON<RecordShard>(path.join(this.shardsPath, shardFile));
      Object.values(shard.records).forEach((location) => livePages.add(location.page));
    }
    await this.removeUnreferenced(this.pagesPath, livePages);
    await this.removeUnreferenced(this.shardsPath, new Set(Object.values(manifest.shards)));
    this.lastCompactionError = undefined;
    this.compactionDebt = 0;
  }

  async storageStats(): Promise<StorageStats> {
    this.pinReader(1);
    try {
      return await this.statsSnapshot();
    } finally {
      this.pinReader(-1);
    }
  }

  private async statsSnapshot(): Promise<StorageStats> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = await this.readManifest();
    const live = new Set(Object.values(manifest.shards).map((file) => path.join(this.shardsPath, file)));
    const liveSizes = new Map<string, number>();
    const pageSlots = new Map<string, Set<number>>();
    let tombstones = 0;
    for (const file of Object.values(manifest.shards)) {
      const shard = await this.fs.loadJSON<RecordShard>(path.join(this.shardsPath, file));
      tombstones += Object.keys(shard.tombstones).length;
      liveSizes.set(
        path.join(this.shardsPath, file),
        new TextEncoder().encode(JSON.stringify({ ...shard, tombstones: {} }, null, 2)).byteLength,
      );
      Object.values(shard.records).forEach((location) => {
        const pagePath = path.join(this.pagesPath, location.page);
        live.add(pagePath);
        const slots = pageSlots.get(pagePath) ?? new Set<number>();
        slots.add(location.index);
        pageSlots.set(pagePath, slots);
      });
    }
    for (const [file, slots] of pageSlots) {
      const rows = await this.fs.loadJSON<any[]>(file);
      const retained = rows.filter((_, index) => slots.has(index));
      liveSizes.set(file, new TextEncoder().encode(JSON.stringify(retained, null, 2)).byteLength);
    }
    let totalBytes = await this.fs.fileSize(this.manifestPath);
    let liveBytes = totalBytes;
    for (const directory of [this.pagesPath, this.shardsPath]) {
      for (const file of (await this.fs.readDir(directory)) as string[]) {
        const filePath = path.join(directory, file);
        const size = await this.fs.fileSize(filePath);
        totalBytes += size;
        if (live.has(filePath)) liveBytes += Math.min(size, liveSizes.get(filePath) ?? size);
      }
    }
    return {
      generation: manifest.generation,
      liveBytes,
      totalBytes,
      reclaimableBytes: totalBytes - liveBytes,
      tombstones,
      lastCompactionError: this.lastCompactionError,
    };
  }

  private async autoCompact(): Promise<void> {
    try {
      if (this.compactionDebt < (this.config.compaction?.minReclaimableBytes ?? 16 * 1024 * 1024)) return;
      const stats = await this.storageStats();
      this.compactionDebt = stats.reclaimableBytes;
      if (shouldCompact(stats, this.config)) await this.compactNow();
    } catch (error) {
      this.lastCompactionError = error instanceof Error ? error.message : 'Compaction failed';
      this.compactionDebt = Infinity;
    }
  }

  async destroy(): Promise<void> {
    this.checkDestroyed();
    await this.initialized;
    return this.queue.add(async () => {
      await this.fs.rmDir(this.system.getOutputPath(), this.collectionName);
      this.destroyed = true;
    });
  }

  private async initialize(): Promise<void> {
    await this.fs.mkdir(this.collectionPath);
    await this.fs.mkdir(this.pagesPath);
    await this.fs.mkdir(this.shardsPath);
    if (await this.fs.exists(this.manifestPath)) return;
    const previousPath = path.join(this.collectionPath, 'data');
    if ((await this.fs.exists(previousPath)) && (await this.fs.readData<any[]>(previousPath)).length > 0) {
      throw new Error(`Collection "${this.collectionName}" requires explicit migration to record storage`);
    }
    await this.fs.writeJSON(this.collectionPath, 'manifest.json', emptyManifest());
  }

  private async applyMutation(manifest: RecordManifest, mutation: RecordMutation): Promise<void> {
    assertMutationBound(Math.max(mutation.deletes?.length ?? 0, mutation.puts?.length ?? 0));
    const generation = manifest.generation + 1;
    const next: RecordManifest = { ...manifest, generation, shards: { ...manifest.shards } };
    const prepared = (mutation.puts ?? []).map((row, index) => ({
      id: typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`,
      row,
    }));
    const affected = new Map<string, RecordShard>();
    for (const id of [...(mutation.deletes ?? []), ...prepared.map((record) => record.id)]) {
      const key = this.shardKey(id);
      if (!affected.has(key)) affected.set(key, await this.readShard(manifest, key));
    }
    // Conservative retired-byte accounting avoids a whole-store statistics scan
    // on every point mutation. Shared pages may overestimate debt, never hide it.
    const retired = new Set<string>();
    for (const [key] of affected) {
      if (manifest.shards[key]) retired.add(path.join(this.shardsPath, manifest.shards[key]));
    }
    for (const id of [...(mutation.deletes ?? []), ...prepared.map((record) => record.id)]) {
      const location = affected.get(this.shardKey(id))?.records[id];
      if (location) retired.add(path.join(this.pagesPath, location.page));
    }
    for (const file of retired) this.compactionDebt += await this.fs.fileSize(file);
    for (const id of mutation.deletes ?? []) {
      const shard = affected.get(this.shardKey(id)) as RecordShard;
      if (shard.records[id]) {
        delete shard.records[id];
        shard.tombstones[id] = generation;
      }
    }
    await this.writePages(prepared, next, affected);
    await Promise.all(
      Array.from(affected, async ([key, shard]) => {
        const file = `shard-${key}-${generation}-${this.nonce()}.json`;
        await this.fs.writeJSON(this.shardsPath, file, shard);
        next.shards[key] = file;
      }),
    );
    await this.fs.writeJSON(this.collectionPath, 'manifest.json', next);
  }

  private async writeReplacement(generation: number, rows: any[]): Promise<void> {
    assertMutationBound(rows.length);
    const manifest = { ...emptyManifest(), generation };
    const prepared = rows.map((row, index) => ({
      id: typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`,
      row,
    }));
    const shards = new Map<string, RecordShard>();
    prepared.forEach((record) => {
      if (!shards.has(this.shardKey(record.id))) shards.set(this.shardKey(record.id), emptyShard());
    });
    await this.writePages(prepared, manifest, shards);
    await Promise.all(
      Array.from(shards, async ([key, shard]) => {
        const file = `shard-${key}-${generation}-${this.nonce()}.json`;
        await this.fs.writeJSON(this.shardsPath, file, shard);
        manifest.shards[key] = file;
      }),
    );
    await this.fs.writeJSON(this.collectionPath, 'manifest.json', manifest);
  }

  private async writePages(
    records: PreparedRecord[],
    manifest: RecordManifest,
    shards: Map<string, RecordShard>,
  ): Promise<void> {
    const rows = records.map((record) => record.row);
    const pages = chunkRecords(rows);
    let recordOffset = 0;
    const writes: Promise<void>[] = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      const pageName = `page-${manifest.generation}-${pageIndex}-${this.nonce()}.json`;
      writes.push(this.fs.writeJSON(this.pagesPath, pageName, page));
      page.forEach((_, index) => {
        const record = records[recordOffset + index];
        const shard = shards.get(this.shardKey(record.id)) as RecordShard;
        const previous = shard.records[record.id];
        const sequence = previous?.sequence ?? manifest.nextSequence++;
        shard.records[record.id] = { index, page: pageName, sequence };
        delete shard.tombstones[record.id];
      });
      recordOffset += page.length;
    }
    await Promise.all(writes);
  }

  private async readShard(manifest: RecordManifest, key: string): Promise<RecordShard> {
    const file = manifest.shards[key];
    return file ? this.fs.loadJSON<RecordShard>(path.join(this.shardsPath, file)) : emptyShard();
  }
  private readManifest(): Promise<RecordManifest> {
    return this.fs.loadJSON(this.manifestPath);
  }
  private readPage(page: string): Promise<any[]> {
    return this.fs.loadJSON(path.join(this.pagesPath, page));
  }
  private shardKey(id: string): string {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    return (hash >>> 24).toString(16).padStart(2, '0');
  }
  private async removeUnreferenced(directory: string, live: Set<string>): Promise<void> {
    const files = (await this.fs.readDir(directory)) as string[];
    await Promise.all(
      files.filter((file) => !live.has(file)).map((file) => this.fs.rmFile(path.join(directory, file))),
    );
  }
  private nonce(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private pinReader(delta: number): void {
    const count = (FSPersistence.readers.get(this.collectionPath) ?? 0) + delta;
    if (count === 0) FSPersistence.readers.delete(this.collectionPath);
    else FSPersistence.readers.set(this.collectionPath, count);
  }
  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
