import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IPersistenceAdapter, RecordMutation, StorageStats } from '../../../interfaces/persistence-adapter.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { readStoragePayload } from '../storage-version';
import { assertMutationBound } from '../record-pages';
import { serializedBytes, shouldCompact } from '../compaction';

interface LocalRecordManifest {
  incarnation?: string;
  camaDB: { format: 'records'; version: 3 };
  generation: number;
  order: string[];
  records: Record<string, string>;
  tombstones: Record<string, number>;
}

const emptyManifest = (): LocalRecordManifest => ({
  incarnation: `${Date.now()}-${Math.random()}`,
  camaDB: { format: 'records', version: 3 },
  generation: 0,
  order: [],
  records: {},
  tombstones: {},
});

/** localStorage record store with generation-keyed records and manifest publication. */
export default class LocalstoragePersistence implements IPersistenceAdapter {
  private static readers = new Map<string, number>();
  private readonly dbName: string;
  private destroyed = false;
  private lastCompactionError?: string;
  private compactionDebt = Infinity;
  private queue: Promise<void> = Promise.resolve();
  private readonly prefix: string;
  private readonly initialized: Promise<void>;

  constructor(
    private config: ICamaConfig,
    private logger: ILogger,
    private collectionName: string,
  ) {
    this.dbName = this.config.path || 'cama';
    this.prefix = `${this.dbName}-${this.collectionName}`;
    this.initialized = this.initialize();
  }

  async insert(rows: any[]): Promise<void> {
    await this.mutateRecords({ puts: rows });
  }

  async getData(): Promise<any[]> {
    this.checkDestroyed();
    await this.initialized;
    const rows: any[] = [];
    for await (const row of this.iterateRecords()) rows.push(row);
    return rows;
  }

  async getRecord(id: string): Promise<any | undefined> {
    this.checkDestroyed();
    await this.initialized;
    const key = this.readManifest().records[id];
    return key ? this.readRecord(key) : undefined;
  }

  async cacheRevision(): Promise<string> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = this.readManifest();
    return manifest.incarnation ? `${manifest.incarnation}:${manifest.generation}` : JSON.stringify(manifest);
  }

  async getRecords(ids: string[]): Promise<Map<string, any>> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = this.readManifest();
    const records = new Map<string, any>();
    for (const id of ids) {
      const key = manifest.records[id];
      if (key) records.set(id, this.readRecord(key));
    }
    return records;
  }

  async *iterateRecords(): AsyncIterable<any> {
    const count = LocalstoragePersistence.readers.get(this.prefix) ?? 0;
    LocalstoragePersistence.readers.set(this.prefix, count + 1);
    try {
      yield* this.iterateSnapshot();
    } finally {
      const remaining = (LocalstoragePersistence.readers.get(this.prefix) ?? 1) - 1;
      if (remaining) LocalstoragePersistence.readers.set(this.prefix, remaining);
      else LocalstoragePersistence.readers.delete(this.prefix);
    }
  }

  private async *iterateSnapshot(): AsyncIterable<any> {
    this.checkDestroyed();
    await this.initialized;
    const manifest = this.readManifest();
    for (const id of manifest.order) {
      const key = manifest.records[id];
      if (key) yield this.readRecord(key);
    }
  }

  async mutateRecords(mutation: RecordMutation): Promise<void> {
    this.checkDestroyed();
    return this.enqueue(async () => {
      await this.initialized;
      this.applyMutation(this.readManifest(), mutation);
    });
  }

  async update(updated: any[]): Promise<void> {
    this.checkDestroyed();
    return this.enqueue(async () => {
      await this.initialized;
      const manifest = this.readManifest();
      this.applyMutation(manifest, { deletes: manifest.order, puts: updated });
    });
  }

  async compact(): Promise<void> {
    this.checkDestroyed();
    await this.initialized;
    return this.enqueue(async () => this.compactNow());
  }

  private compactNow(): void {
    const manifest = this.readManifest();
    this.writeManifest({ ...manifest, tombstones: {} });
    if ((LocalstoragePersistence.readers.get(this.prefix) ?? 0) > 0) return;
    const live = new Set([...Object.values(manifest.records), this.manifestKey()]);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${this.prefix}-record-`) && !live.has(key)) window.localStorage.removeItem(key);
    }
    this.lastCompactionError = undefined;
    this.compactionDebt = 0;
  }

  async storageStats(): Promise<StorageStats> {
    this.checkDestroyed();
    await this.initialized;
    return this.statsNow();
  }

  private statsNow(): StorageStats {
    const manifest = this.readManifest();
    const live = new Set([...Object.values(manifest.records), this.manifestKey()]);
    let totalBytes = 0;
    let liveBytes = 0;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(`${this.prefix}-record-`)) continue;
      const bytes = serializedBytes(key) + serializedBytes(window.localStorage.getItem(key));
      totalBytes += bytes;
      if (live.has(key)) liveBytes += bytes;
    }
    const tombstoneBytes = serializedBytes(manifest.tombstones) - 2;
    liveBytes -= tombstoneBytes;
    return {
      generation: manifest.generation,
      liveBytes,
      totalBytes,
      reclaimableBytes: totalBytes - liveBytes,
      tombstones: Object.keys(manifest.tombstones).length,
      lastCompactionError: this.lastCompactionError,
    };
  }

  async destroy(): Promise<void> {
    await this.initialized;
    return this.enqueue(async () => {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(this.prefix)) window.localStorage.removeItem(key);
      }
      this.destroyed = true;
    });
  }

  private async initialize(): Promise<void> {
    if (window.localStorage.getItem(this.manifestKey())) return;
    const previous = window.localStorage.getItem(`${this.prefix}-data`);
    if (previous && readStoragePayload(JSON.parse(previous)).length > 0) {
      throw new Error(`Collection "${this.collectionName}" requires explicit migration to record storage`);
    }
    this.writeManifest(emptyManifest());
  }

  private applyMutation(manifest: LocalRecordManifest, mutation: RecordMutation): void {
    assertMutationBound(Math.max(mutation.deletes?.length ?? 0, mutation.puts?.length ?? 0));
    const retiredIds = new Set([...(mutation.deletes ?? []), ...(mutation.puts ?? []).map((row) => row?._id)]);
    for (const id of retiredIds) {
      const key = manifest.records[id];
      if (key) this.compactionDebt += serializedBytes(key) + serializedBytes(window.localStorage.getItem(key));
    }
    const next: LocalRecordManifest = {
      ...manifest,
      generation: manifest.generation + 1,
      order: [...manifest.order],
      records: { ...manifest.records },
      tombstones: { ...manifest.tombstones },
    };
    for (const id of mutation.deletes ?? []) {
      if (!next.records[id]) continue;
      delete next.records[id];
      next.order = next.order.filter((current) => current !== id);
      next.tombstones[id] = next.generation;
    }
    (mutation.puts ?? []).forEach((row, index) => {
      const id = typeof row?._id === 'string' ? row._id : `legacy-${next.generation}-${index}-${this.nonce()}`;
      const recordKey = `${this.prefix}-record-${encodeURIComponent(id)}-${next.generation}`;
      window.localStorage.setItem(recordKey, JSON.stringify(row));
      if (!next.records[id]) next.order.push(id);
      next.records[id] = recordKey;
      delete next.tombstones[id];
    });
    this.writeManifest(next);
    try {
      const policy = { ...this.config, compaction: { minReclaimableBytes: 64 * 1024, ...this.config.compaction } };
      if (this.compactionDebt < (policy.compaction.minReclaimableBytes ?? 64 * 1024)) return;
      const stats = this.statsNow();
      this.compactionDebt = stats.reclaimableBytes;
      if (shouldCompact(stats, policy)) this.compactNow();
    } catch (error) {
      this.lastCompactionError = error instanceof Error ? error.message : 'Compaction failed';
      this.compactionDebt = Infinity;
    }
  }

  private readManifest(): LocalRecordManifest {
    return JSON.parse(window.localStorage.getItem(this.manifestKey()) as string) as LocalRecordManifest;
  }
  private writeManifest(manifest: LocalRecordManifest): void {
    window.localStorage.setItem(this.manifestKey(), JSON.stringify(manifest));
  }
  private readRecord(key: string): any {
    const value = window.localStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  }
  private manifestKey(): string {
    return `${this.prefix}-record-manifest`;
  }
  private nonce(): string {
    return Math.random().toString(36).slice(2, 10);
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
