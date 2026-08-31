export interface EmbeddingProvenance {
  provider: string;
  model: string;
  dimensions: number;
  createdAt: string;
  revision?: string;
}

export interface MemoryRecord<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  content: string;
  embedding?: readonly number[];
  embeddingProvenance?: EmbeddingProvenance;
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
