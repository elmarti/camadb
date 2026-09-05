export {
  EmbeddingCompatibilityError,
  assertEmbeddingCompatibility,
  compareEmbeddingProvenance,
  createEmbeddingProvenance,
  planReembedding,
  prepareEmbeddingQuery,
  stageReembedding,
  validateEmbeddingProfile,
  validateEmbeddingVector,
} from './embedding-provenance';
export type {
  EmbeddingCompatibility,
  EmbeddingCompatibilityField,
  EmbeddingCompatibilityMismatch,
  EmbeddingProfile,
  EmbeddingProvenance,
  EmbeddingQuery,
  ProvenancedEmbeddingRecord,
  ReembeddingPlan,
  ReembeddingPlanItem,
  ReembeddingReason,
  ReembeddingUpdate,
} from './embedding-provenance';

import type { ProvenancedEmbeddingRecord } from './embedding-provenance';

export interface MemoryRecord<Metadata extends Record<string, unknown> = Record<string, unknown>>
  extends ProvenancedEmbeddingRecord {
  content: string;
  metadata?: Metadata;
}

export interface RetrievalResult<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  memory: MemoryRecord<Metadata>;
  score: number;
}

export interface MemoryStore<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  remember(memory: MemoryRecord<Metadata>): Promise<void>;
  forget(id: string): Promise<void>;
  retrieve(query: string, limit?: number): Promise<readonly RetrievalResult<Metadata>[]>;
}
