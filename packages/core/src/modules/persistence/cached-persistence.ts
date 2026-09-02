import { CacheConfig, CacheStats } from '../../interfaces/cache.interface';
import { IPersistenceAdapter, RecordMutation, StorageStats } from '../../interfaces/persistence-adapter.interface';
import { serializedBytes } from './compaction';

/** Record cache only: query result arrays and storage working sets are never retained here. */
export class CachedPersistence implements IPersistenceAdapter {
  private entries = new Map<string, { value: any; bytes: number }>();
  private revision?: string;
  private epoch = 0;
  private warmed = false;
  private destroyed = false;
  private stats: CacheStats;

  constructor(
    private adapter: IPersistenceAdapter,
    config: CacheConfig = { mode: 'disabled' },
  ) {
    const maxBytes = config.maxBytes ?? 8 * 1024 * 1024;
    const maxRecords = config.maxRecords ?? 1000;
    if (!['disabled', 'eager', 'lazy', 'lru'].includes(config.mode)) throw new Error('Unknown cache mode');
    for (const limit of [maxBytes, maxRecords]) {
      if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Cache limits must be nonnegative safe integers');
    }
    if (config.mode !== 'disabled' && (!adapter.cacheRevision || !adapter.getRecord || !adapter.iterateRecords)) {
      throw new Error('Caching requires revision-aware record persistence');
    }
    this.stats = {
      mode: config.mode,
      maxBytes,
      maxRecords,
      bytes: 0,
      records: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      skipped: 0,
      invalidations: 0,
    };
  }

  cacheStats(): CacheStats {
    return { ...this.stats };
  }

  clearCache(): void {
    this.entries.clear();
    this.stats.bytes = 0;
    this.stats.records = 0;
    this.stats.invalidations++;
    this.epoch++;
    this.warmed = false;
    this.revision = undefined;
  }

  async initializeCache(): Promise<void> {
    this.checkDestroyed();
    if (this.stats.mode !== 'eager') return;
    const revision = await this.synchronize();
    if (this.warmed) return;
    const epoch = this.epoch;
    for await (const row of this.adapter.iterateRecords!()) {
      if (epoch !== this.epoch) return;
      if (this.stats.records >= this.stats.maxRecords || this.stats.bytes >= this.stats.maxBytes) break;
      this.admit(row?._id, row);
    }
    if (epoch !== this.epoch) return;
    if (revision !== (await this.adapter.cacheRevision!())) this.clearCache();
    else this.warmed = true;
  }

  async getRecord(id: string): Promise<any | undefined> {
    return (await this.getRecords([id])).get(id);
  }

  async getRecords(ids: string[]): Promise<Map<string, any>> {
    this.checkDestroyed();
    if (this.stats.mode === 'disabled' && this.adapter.getRecords) return this.adapter.getRecords(ids);
    await this.initializeCache();
    const revision = await this.synchronize();
    const epoch = this.epoch;
    const records = new Map<string, any>();
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      const entry = this.entries.get(id);
      if (entry) {
        this.stats.hits++;
        if (this.stats.mode === 'lru') {
          this.entries.delete(id);
          this.entries.set(id, entry);
        }
        records.set(id, structuredClone(entry.value));
      } else {
        this.stats.misses++;
        missing.push(id);
      }
    }
    if (!missing.length) return records;
    const loaded = this.adapter.getRecords
      ? await this.adapter.getRecords(missing)
      : new Map(await Promise.all(missing.map(async (id) => [id, await this.adapter.getRecord!(id)] as const)));
    const current = epoch === this.epoch && revision === (await this.adapter.cacheRevision!());
    if (!current) {
      this.clearCache();
      // Do not combine cached records from one generation with newly loaded records from another.
      const fresh = this.adapter.getRecords
        ? await this.adapter.getRecords(ids)
        : new Map(await Promise.all(ids.map(async (id) => [id, await this.adapter.getRecord!(id)] as const)));
      return new Map(
        Array.from(fresh)
          .filter(([, row]) => row !== undefined)
          .map(([id, row]) => [id, structuredClone(row)]),
      );
    }
    // Overlapping commits may return a read snapshot, but must never seed stale entries.
    for (const [id, row] of loaded) {
      if (row === undefined) continue;
      if (current) this.admit(id, row);
      records.set(id, structuredClone(row));
    }
    return records;
  }

  async getData(): Promise<any[]> {
    this.checkDestroyed();
    // Preserve adapter ordering and snapshot semantics; never build a second collection cache.
    const rows = await this.adapter.getData();
    return this.stats.mode === 'disabled' ? rows : structuredClone(rows);
  }

  async *iterateRecords(): AsyncIterable<any> {
    this.checkDestroyed();
    for await (const row of this.adapter.iterateRecords!()) {
      yield this.stats.mode === 'disabled' ? row : structuredClone(row);
    }
  }

  insert(rows: any[]): Promise<void> {
    return this.write(() => this.adapter.insert(this.copyInput(rows)));
  }
  update(rows: any): Promise<void> {
    return this.write(() => this.adapter.update(this.copyInput(rows)));
  }
  mutateRecords(mutation: RecordMutation): Promise<void> {
    return this.write(() => this.adapter.mutateRecords!(this.copyInput(mutation)));
  }
  compact(): Promise<void> {
    return this.write(async () => {
      await this.adapter.compact?.();
    });
  }
  storageStats(): Promise<StorageStats> {
    this.checkDestroyed();
    return this.adapter.storageStats!();
  }
  cacheRevision(): Promise<string> {
    this.checkDestroyed();
    return this.adapter.cacheRevision!();
  }
  async destroy(): Promise<void> {
    await this.write(() => this.adapter.destroy());
    this.destroyed = true;
  }

  private async write(operation: () => Promise<any>): Promise<void> {
    this.checkDestroyed();
    this.clearCache();
    try {
      await operation();
    } finally {
      this.clearCache();
    }
  }

  private async synchronize(): Promise<string> {
    try {
      const revision = await this.adapter.cacheRevision!();
      if (revision !== this.revision) {
        this.clearCache();
        this.revision = revision;
      }
      return revision;
    } catch (error) {
      this.clearCache();
      throw error;
    }
  }

  private admit(id: unknown, value: any): void {
    if (typeof id !== 'string' || value === undefined || this.entries.has(id)) return;
    let bytes: number;
    let copy: any;
    try {
      if (!this.isJsonValue(value)) {
        this.stats.skipped++;
        return;
      }
      bytes = serializedBytes(value) + serializedBytes(id);
      if (bytes > this.stats.maxBytes || this.stats.maxRecords === 0) {
        this.stats.skipped++;
        return;
      }
      copy = structuredClone(value);
    } catch {
      // Cyclic/unserializable values remain readable but are not cached.
      this.stats.skipped++;
      return;
    }
    while (this.stats.bytes + bytes > this.stats.maxBytes || this.entries.size >= this.stats.maxRecords) {
      if (this.stats.mode !== 'lru') {
        this.stats.skipped++;
        return;
      }
      const oldest = this.entries.keys().next().value as string;
      this.stats.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
      this.stats.evictions++;
    }
    this.entries.set(id, { value: copy, bytes });
    this.stats.bytes += bytes;
    this.stats.records = this.entries.size;
  }

  private copyInput<T>(value: T): T {
    return this.stats.mode === 'disabled' ? value : structuredClone(value);
  }

  private isJsonValue(value: any, seen = new Set<object>()): boolean {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
      return true;
    if (typeof value !== 'object' || seen.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    // structuredClone/IndexedDB can return plain objects from another JS realm.
    if (!Array.isArray(value) && prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
    seen.add(value);
    const supported = Object.values(value).every((child) => this.isJsonValue(child, seen));
    seen.delete(value);
    return supported;
  }

  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
}
