import { CacheStats } from './cache.interface';

export interface RecordMutation<T = any> {
  deletes?: string[];
  puts?: T[];
}

export interface StorageStats {
  lastCompactionError?: string;
  generation: number;
  liveBytes: number;
  reclaimableBytes: number;
  tombstones: number;
  totalBytes: number;
}

export interface IPersistenceAdapter {
  insert(ts: Array<any>): Promise<any>;
  getData(): Promise<any>;

  /** Bounded record APIs implemented by format-v3 adapters. */
  getRecord?(id: string): Promise<any | undefined>;
  getRecords?(ids: string[]): Promise<Map<string, any>>;
  iterateRecords?(): AsyncIterable<any>;
  mutateRecords?(mutation: RecordMutation): Promise<void>;
  compact?(): Promise<void>;
  storageStats?(): Promise<StorageStats>;
  /** Opaque committed-state token; must change on writes and recreation. */
  cacheRevision?(): Promise<string>;
  initializeCache?(): Promise<void>;
  cacheStats?(): CacheStats;
  clearCache?(): void;

  /** Returns storage-ordered candidates when a metadata index can narrow the query. */
  queryRecords?(query: Record<string, unknown>): Promise<any[] | undefined>;

  update(updated: any): Promise<void>;

  destroy(): Promise<void>;
}
