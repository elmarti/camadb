import type {
  HybridFusion,
  HybridTextComponent,
  HybridVectorComponent,
  TextSearchMatch,
  VectorMetric,
} from '@camadb/core';
import type { EmbeddingProfile, EmbeddingProvenance, EmbeddingQuery } from './embedding-provenance';

export const MEMORY_RECORD_SCHEMA_VERSION = 1 as const;
export const MEMORY_EXPORT_SCHEMA_VERSION = 1 as const;

export const MEMORY_CATEGORIES = [
  'conversation',
  'fact',
  'instruction',
  'observation',
  'preference',
  'summary',
  'other',
] as const;

export type MemoryCategory = typeof MEMORY_CATEGORIES[number];

export interface MemoryRecord<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  category: MemoryCategory;
  content: string;
  createdAt: string;
  embedding?: readonly number[];
  embeddingProvenance?: EmbeddingProvenance;
  expiresAt?: string;
  id: string;
  metadata?: Metadata;
  schemaVersion: typeof MEMORY_RECORD_SCHEMA_VERSION;
  updatedAt: string;
}

export interface RememberInput<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  category?: MemoryCategory;
  content: string;
  /** A caller-produced embedding. The configured profile must be compatible. */
  embedding?: EmbeddingQuery;
  expiresAt?: string;
  id?: string;
  metadata?: Metadata;
}

export interface EditMemoryInput<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  category?: MemoryCategory;
  content?: string;
  /** Set to null to remove the stored embedding. */
  embedding?: EmbeddingQuery | null;
  /** Set to null to remove expiry. */
  expiresAt?: string | null;
  /** Set to null to remove metadata. */
  metadata?: Metadata | null;
}

export interface EmbeddingProvider {
  /**
   * Generate a finite numeric vector in the declared provider profile. Network calls occur only if this application-supplied implementation makes them.
   */
  embed(content: string): Promise<readonly number[]>;
  profile: EmbeddingProfile;
}

export interface MemoryStoreOptions {
  collectionName?: string;
  /** Enables caller-produced vectors without installing an embedding provider. */
  embeddingProfile?: EmbeddingProfile;
  /** Optional local or cloud implementation supplied entirely by the application. */
  embeddingProvider?: EmbeddingProvider;
  /**
   * Supply a valid clock value for memory lifecycle timestamps; defaults to the current Date.
   */
  now?: () => Date;
}

export type RecallStrategy = 'auto' | 'hybrid' | 'text' | 'vector';

export interface RecallOptions {
  candidateLimit?: number;
  category?: MemoryCategory | readonly MemoryCategory[];
  /** A caller-produced query vector. The configured profile must be compatible. */
  embedding?: EmbeddingQuery;
  fusion?: HybridFusion;
  includeExpired?: boolean;
  limit?: number;
  match?: TextSearchMatch;
  metric?: VectorMetric;
  strategy?: RecallStrategy;
}

export interface TextRecallExplanation extends HybridTextComponent {
  matchedTerms: string[];
}

export interface VectorRecallExplanation extends HybridVectorComponent {
  metric: VectorMetric;
}

export interface RecallExplanation {
  embeddingProfile?: EmbeddingProfile;
  strategy: Exclude<RecallStrategy, 'auto'>;
  text?: TextRecallExplanation;
  vector?: VectorRecallExplanation;
}

export interface RecallResult<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  explanation: RecallExplanation;
  memory: MemoryRecord<Metadata>;
  score: number;
}

export interface ListMemoriesOptions {
  category?: MemoryCategory | readonly MemoryCategory[];
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

export interface MemoryExport<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  exportedAt: string;
  memories: readonly MemoryRecord<Metadata>[];
  schemaVersion: typeof MEMORY_EXPORT_SCHEMA_VERSION;
}

export interface ForgetResult {
  forgotten: boolean;
  id: string;
}

export interface MemoryStore<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Edit an existing memory and update its timestamp.
   * Changing content refreshes or validates embedding data; invalid changes reject.
   * @param id - Stable memory identity.
   * @param changes - Content, category, metadata, expiry or embedding changes.
   * @returns The updated memory; throws when the ID does not exist.
   */
  edit(id: string, changes: EditMemoryInput<Metadata>): Promise<MemoryRecord<Metadata>>;
  /**
   * Read the ranking evidence already attached to a recall result without another query.
   * @param result - A previously returned recall result.
   * @returns Component scores, ranks and provenance used for that result.
   */
  explain(result: RecallResult<Metadata>): RecallExplanation;
  /**
   * Export all stored memories, including expired records, in the versioned logical export format.
   * The result is materialized in memory; storing the backup is the caller's responsibility.
   */
  export(): Promise<MemoryExport<Metadata>>;
  /**
   * Delete a memory by ID and report whether a record was removed.
   * @param id - Memory to remove.
   * @returns The identity and deletion outcome; this is not guaranteed physical secure erasure.
   */
  forget(id: string): Promise<ForgetResult>;
  /**
   * Read a memory by identity, including expired memories.
   * @param id - Memory identity.
   * @returns The stored memory, or undefined when absent.
   */
  inspect(id: string): Promise<MemoryRecord<Metadata> | undefined>;
  /**
   * List stored memories with optional category, expiry and pagination controls.
   * Expired memories are excluded unless explicitly included.
   * @param options - Filters and paging settings.
   * @returns Matching memories.
   */
  list(options?: ListMemoriesOptions): Promise<readonly MemoryRecord<Metadata>[]>;
  /**
   * Retrieve memories using text, vector or hybrid ranking without modifying records.
   * Auto mode uses hybrid when embeddings are available and text otherwise. Expired memories are excluded by default.
   * @param query - Query text.
   * @param options - Strategy, filters, limits and optional compatible query embedding.
   * @returns Ranked memories with inspectable retrieval evidence.
   */
  recall(query: string, options?: RecallOptions): Promise<readonly RecallResult<Metadata>[]>;
  /**
   * Validate and store one memory, generating embeddings only through an explicit provider.
   * @param memory - Content, category, metadata and optional expiry/embedding.
   * @returns The stored memory with stable ID and timestamps.
   */
  remember(memory: RememberInput<Metadata>): Promise<MemoryRecord<Metadata>>;
  /**
   * Validate memories and resolve embeddings before one atomic collection insert.
   * A provider failure cannot partially insert the batch. The 10,000-record mutation ceiling applies.
   * @param memories - Memories to insert together.
   * @returns Stored memories in input order.
   */
  rememberMany(memories: readonly RememberInput<Metadata>[]): Promise<readonly MemoryRecord<Metadata>[]>;
}

export interface StoredMemoryDocument<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  category: MemoryCategory;
  content: string;
  createdAt: string;
  embedding?: readonly number[];
  embeddingProvenance?: EmbeddingProvenance;
  expiresAt?: string;
  metadata?: Metadata;
  schemaVersion: typeof MEMORY_RECORD_SCHEMA_VERSION;
  updatedAt: string;
}
