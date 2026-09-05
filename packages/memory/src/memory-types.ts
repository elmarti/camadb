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
  embed(content: string): Promise<readonly number[]>;
  profile: EmbeddingProfile;
}

export interface MemoryStoreOptions {
  collectionName?: string;
  /** Enables caller-produced vectors without installing an embedding provider. */
  embeddingProfile?: EmbeddingProfile;
  /** Optional local or cloud implementation supplied entirely by the application. */
  embeddingProvider?: EmbeddingProvider;
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
  edit(id: string, changes: EditMemoryInput<Metadata>): Promise<MemoryRecord<Metadata>>;
  explain(result: RecallResult<Metadata>): RecallExplanation;
  export(): Promise<MemoryExport<Metadata>>;
  forget(id: string): Promise<ForgetResult>;
  inspect(id: string): Promise<MemoryRecord<Metadata> | undefined>;
  list(options?: ListMemoriesOptions): Promise<readonly MemoryRecord<Metadata>[]>;
  recall(query: string, options?: RecallOptions): Promise<readonly RecallResult<Metadata>[]>;
  remember(memory: RememberInput<Metadata>): Promise<MemoryRecord<Metadata>>;
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
