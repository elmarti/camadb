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

export { CamaMemory, createMemoryStore } from './memory-store';
export {
  MEMORY_CATEGORIES,
  MEMORY_EXPORT_SCHEMA_VERSION,
  MEMORY_RECORD_SCHEMA_VERSION,
} from './memory-types';
export type {
  EditMemoryInput,
  EmbeddingProvider,
  ForgetResult,
  ListMemoriesOptions,
  MemoryCategory,
  MemoryExport,
  MemoryRecord,
  MemoryStore,
  MemoryStoreOptions,
  RecallExplanation,
  RecallOptions,
  RecallResult,
  RecallStrategy,
  RememberInput,
  StoredMemoryDocument,
  TextRecallExplanation,
  VectorRecallExplanation,
} from './memory-types';
