import { CacheStats } from './cache.interface';
import { TextSearchHit, TextSearchOptions } from './text-search.interface';
import { VectorSearchHit, VectorSearchOptions } from './vector-search.interface';

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
  /** True when getData returns an already-resident array without storage hydration. */
  readonly recordsResident?: boolean;
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
  /** Returns storage-ordered records only when metadata indexes satisfy the complete query. */
  queryExactRecords?(query: Record<string, unknown>): Promise<any[] | undefined>;
  /** Returns storage-ordered candidate identities without loading their records. */
  queryRecordIds?(query: Record<string, unknown>): Promise<string[] | undefined>;
  searchText?(query: string, options?: TextSearchOptions<any>): Promise<TextSearchHit<any>[]>;
  searchVector?(
    field: string,
    vector: readonly number[],
    options?: VectorSearchOptions<any>,
  ): Promise<VectorSearchHit<any>[]>;

  update(updated: any): Promise<void>;

  destroy(): Promise<void>;
}
