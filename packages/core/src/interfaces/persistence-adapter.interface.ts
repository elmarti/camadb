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
  /**
   * Append documents to adapter storage. Collection-level validation is performed by the caller.
   */
  insert(ts: Array<any>): Promise<any>;
  /**
   * Materialize all stored documents; prefer record APIs for bounded access.
   */
  getData(): Promise<any>;

  /** Bounded record APIs implemented by format-v3 adapters. */
  getRecord?(id: string): Promise<any | undefined>;
  /**
   * Read selected identities into an ID-to-document map; absent records are omitted.
   */
  getRecords?(ids: string[]): Promise<Map<string, any>>;
  /**
   * Iterate live records in adapter storage order without requiring one complete result array.
   */
  iterateRecords?(): AsyncIterable<any>;
  /**
   * Atomically publish a bounded set of record puts and deletes, or reject before publication.
   */
  mutateRecords?(mutation: RecordMutation): Promise<void>;
  /**
   * Reclaim obsolete storage while retaining the current committed records.
   * Requires temporary space for replacement storage and is serialized with writes.
   * @returns Completion of explicit maintenance; failures reject.
   */
  compact?(): Promise<void>;
  /**
   * Inspect current storage generation, live/reclaimable bytes and maintenance errors.
   * Browser byte counts are serialized logical estimates, not OS disk or browser quota measurements.
   * @returns Adapter storage statistics.
   */
  storageStats?(): Promise<StorageStats>;
  /** Opaque committed-state token; must change on writes and recreation. */
  cacheRevision?(): Promise<string>;
  /**
   * Await adapter initialization and warm the configured eager record cache if applicable.
   */
  initializeCache?(): Promise<void>;
  /**
   * Read record-cache hit, miss, residency and budget statistics.
   * The budget excludes query result arrays, indexes and other adapter allocations.
   * @returns Current cache statistics; throws when the adapter does not expose them.
   */
  cacheStats?(): CacheStats;
  /**
   * Evict resident record-cache entries without deleting persisted documents.
   */
  clearCache?(): void;

  /** Returns storage-ordered candidates when a metadata index can narrow the query. */
  queryRecords?(query: Record<string, unknown>): Promise<any[] | undefined>;
  /** Returns storage-ordered records only when metadata indexes satisfy the complete query. */
  queryExactRecords?(query: Record<string, unknown>): Promise<any[] | undefined>;
  /** Returns storage-ordered candidate identities without loading their records. */
  queryRecordIds?(query: Record<string, unknown>): Promise<string[] | undefined>;
  /**
   * Rank documents from configured text indexes using deterministic BM25.
   * @param query - Text tokenized with the index tokenizer.
   * @param options - Match mode, metadata filter and result limit.
   * @returns Documents with scores and normalized matched terms.
   */
  searchText?(query: string, options?: TextSearchOptions<any>): Promise<TextSearchHit<any>[]>;
  /**
   * Perform exact similarity search over a configured vector field.
   * @param field - Indexed vector field.
   * @param vector - Finite numeric vector with the configured dimensions.
   * @param options - Filter, metric and result limit.
   * @returns Ranked documents and vector similarity scores.
   * @throws For invalid dimensions, vector values or index configuration.
   */
  searchVector?(
    field: string,
    vector: readonly number[],
    options?: VectorSearchOptions<any>,
  ): Promise<VectorSearchHit<any>[]>;

  /**
   * Replace the adapter document payload with the supplied updated state.
   */
  update(updated: any): Promise<void>;

  /**
   * Delete this adapter's persisted collection data. This is not a close operation.
   */
  destroy(): Promise<void>;
}
