import { Filter } from './document-types';

export type VectorMetric = 'cosine' | 'dot' | 'euclidean';

export interface VectorIndexConfig {
  /** Top-level document field containing a finite numeric vector. */
  field: string;
  /** Exact number of vector components accepted for this field. */
  dimensions: number;
}

export type VectorField<TDocument extends object> = string extends keyof TDocument
  ? string
  : Extract<{
    [TKey in keyof TDocument]-?: NonNullable<TDocument[TKey]> extends readonly number[] ? TKey : never;
  }[keyof TDocument], string>;

export interface VectorSearchOptions<TDocument extends object> {
  filter?: Filter<TDocument>;
  /** Number of highest-scoring exact matches to return. Defaults to 10. */
  limit?: number;
  metric?: VectorMetric;
}

export interface VectorSearchHit<TDocument extends object> {
  document: TDocument;
  /** Higher is always better. Euclidean scores are the negated distance. */
  score: number;
}
