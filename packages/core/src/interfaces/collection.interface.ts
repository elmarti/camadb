import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';
import { ServiceRegistry } from '../util/service-registry';
import {
  AggregationPipeline,
  Document,
  DocumentId,
  Filter,
  InsertDocument,
  StoredDocument,
  Update,
} from './document-types';
import { DeleteResult, InsertManyResult, InsertOneResult, UpdateResult } from './mutation-result.interface';
import { StorageStats } from './persistence-adapter.interface';
import { CacheStats } from './cache.interface';
import { TextSearchHit, TextSearchOptions } from './text-search.interface';
import {
  VectorField,
  VectorSearchHit,
  VectorSearchOptions,
} from './vector-search.interface';
import { HybridSearchHit, HybridSearchOptions } from './hybrid-search.interface';

export interface ICollection<TDocument extends object = Document> {
  container?: ServiceRegistry;
  /**
   * Insert a batch of documents, generating immutable string IDs when omitted.
   * Rejects duplicate IDs without partially inserting the batch. Submit at most 10,000 records per atomic mutation.
   * @param rows - Documents to insert; each serialized record must fit the storage bound.
   * @returns Acknowledgement, inserted count and IDs in input order.
   */
  insertMany(rows: InsertDocument<TDocument>[]): Promise<InsertManyResult<DocumentId>>;
  /**
   * Insert one document with a supplied or generated immutable string ID.
   * @param row - Document to insert.
   * @returns The acknowledged inserted ID.
   * @throws If the ID already exists or the document exceeds storage bounds.
   */
  insertOne(row: InsertDocument<TDocument>): Promise<InsertOneResult<DocumentId>>;
  /**
   * Find matching documents with optional sorting and offset pagination.
   * Supported metadata predicates may use indexes; general queries can scan. A result limit does not bound sort or scan memory.
   * @param query - Sift-style filter; omitted means all documents.
   * @param options - Sort selectors, offset and result limit.
   * @returns Returned rows and query counts.
   * @example
   * ```ts
   * const page = await collection.findMany({ topic: 'notes' }, { limit: 20 });
   * console.log(page.rows);
   * ```
   */
  findMany(
    query?: Filter<StoredDocument<TDocument>>,
    options?: IQueryOptions<StoredDocument<TDocument>>,
  ): Promise<IFilterResult<StoredDocument<TDocument>>>;
  /**
   * Rank documents from configured text indexes using deterministic BM25.
   * @param query - Text tokenized with the index tokenizer.
   * @param options - Match mode, metadata filter and result limit.
   * @returns Documents with scores and normalized matched terms.
   */
  searchText(
    query: string,
    options?: TextSearchOptions<StoredDocument<TDocument>>,
  ): Promise<TextSearchHit<StoredDocument<TDocument>>[]>;
  /**
   * Perform exact similarity search over a configured vector field.
   * @param field - Indexed vector field.
   * @param vector - Finite numeric vector with the configured dimensions.
   * @param options - Filter, metric and result limit.
   * @returns Ranked documents and vector similarity scores.
   * @throws For invalid dimensions, vector values or index configuration.
   */
  searchVector(
    field: VectorField<StoredDocument<TDocument>>,
    vector: readonly number[],
    options?: VectorSearchOptions<StoredDocument<TDocument>>,
  ): Promise<VectorSearchHit<StoredDocument<TDocument>>[]>;
  /**
   * Fuse text and exact-vector rankings while preserving component evidence.
   * @param options - Keyword query, vector query, candidate limit, filters and explicit fusion settings.
   * @returns Ranked documents with component ranks, scores and fusion contributions.
   */
  searchHybrid(
    options: HybridSearchOptions<StoredDocument<TDocument>>,
  ): Promise<HybridSearchHit<StoredDocument<TDocument>>[]>;
  /**
   * Apply an update to every matching document while preserving each immutable ID.
   * @param query - Filter selecting documents to update.
   * @param delta - Update operators, such as `$set`; changing `_id` is rejected.
   * @returns Matched and modified counts; upserted count is zero.
   */
  updateMany(
    query: Filter<StoredDocument<TDocument>>,
    delta: Update<Omit<TDocument, '_id'>>,
  ): Promise<UpdateResult<DocumentId>>;
  /**
   * Delete the first matching document in collection order.
   * @param query - Filter selecting a document.
   * @returns Acknowledgement and a deleted count of zero or one.
   */
  deleteOne(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult>;
  /**
   * Delete all documents matching the filter.
   * @param query - Filter selecting documents; an empty filter selects every document.
   * @returns Acknowledgement and the number deleted.
   */
  deleteMany(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult>;
  /**
   * Count documents matching a filter without returning those documents.
   * @param query - Optional filter; omitted means all documents.
   * @returns The matching document count.
   */
  count(query?: Filter<StoredDocument<TDocument>>): Promise<number>;
  /**
   * Update all matching documents with supplied fields, or insert when none matches.
   * @param query - Filter used to locate an existing document.
   * @param document - Fields to apply or insert; the supplied `_id` is used only when inserting.
   * @returns Matched, modified and upserted counts, with the inserted ID for an upsert.
   */
  upsert(
    query: Filter<StoredDocument<TDocument>>,
    document: InsertDocument<TDocument>,
  ): Promise<UpdateResult<DocumentId>>;
  /**
   * Permanently delete the collection's persisted data and invalidate this handle.
   * This is destructive storage removal, not a connection-close operation.
   * @returns Completion after adapter deletion finishes.
   */
  destroy(): Promise<void>;
  /**
   * Reclaim obsolete storage while retaining the current committed records.
   * Requires temporary space for replacement storage and is serialized with writes.
   * @returns Completion of explicit maintenance; failures reject.
   */
  compact(): Promise<void>;
  /**
   * Inspect current storage generation, live/reclaimable bytes and maintenance errors.
   * Browser byte counts are serialized logical estimates, not OS disk or browser quota measurements.
   * @returns Adapter storage statistics.
   */
  storageStats(): Promise<StorageStats>;
  /**
   * Read record-cache hit, miss, residency and budget statistics.
   * The budget excludes query result arrays, indexes and other adapter allocations.
   * @returns Current cache statistics; throws when the adapter does not expose them.
   */
  cacheStats(): CacheStats;
  /**
   * Evict resident record-cache entries without deleting persisted documents.
   */
  clearCache(): void;
  /**
   * Evaluate a Mingo aggregation pipeline over collection documents.
   * Cross-collection lookup is unsupported; aggregation may materialize the dataset.
   * @param pipeline - Ordered aggregation stages.
   * @returns Pipeline results with the caller-selected output type.
   */
  aggregate<TResult extends object = StoredDocument<TDocument>>(
    pipeline: AggregationPipeline<StoredDocument<TDocument>>,
  ): Promise<TResult[]>;
}
