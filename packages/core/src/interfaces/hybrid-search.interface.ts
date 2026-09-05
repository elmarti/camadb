import { Filter } from './document-types';
import { TextSearchMatch } from './text-search.interface';
import { VectorField, VectorMetric } from './vector-search.interface';

export interface ReciprocalRankFusion {
  /** Reciprocal-rank fusion is intentionally explicit so scoring is never hidden. */
  strategy: 'rrf';
  /** Dampens rank differences. Defaults to 60. */
  rankConstant?: number;
  /** Keyword contribution multiplier. Defaults to 1. */
  textWeight?: number;
  /** Vector contribution multiplier. Defaults to 1. */
  vectorWeight?: number;
}

export interface WeightedScoreFusion {
  /** Min-max normalize each candidate set, then add weighted component scores. */
  strategy: 'weighted-score';
  /** Keyword contribution multiplier. Defaults to 1. */
  textWeight?: number;
  /** Vector contribution multiplier. Defaults to 1. */
  vectorWeight?: number;
}

export type HybridFusion = ReciprocalRankFusion | WeightedScoreFusion;

export interface HybridSearchOptions<TDocument extends object> {
  /** Number of candidates requested from each component. Defaults to max(50, limit × 5). */
  candidateLimit?: number;
  filter?: Filter<TDocument>;
  fusion?: HybridFusion;
  /** Final top-k result count. Defaults to 10. */
  limit?: number;
  text: {
    match?: TextSearchMatch;
    query: string;
  };
  vector: {
    field: VectorField<TDocument>;
    metric?: VectorMetric;
    query: readonly number[];
  };
}

export interface HybridTextComponent {
  contribution: number;
  matchedTerms: string[];
  rank: number;
  /** Original BM25 score. */
  score: number;
}

export interface HybridVectorComponent {
  contribution: number;
  rank: number;
  /** Original vector score using the requested metric. */
  score: number;
}

export interface HybridSearchHit<TDocument extends object> {
  components: {
    text?: HybridTextComponent;
    vector?: HybridVectorComponent;
  };
  document: TDocument;
  /** Sum of the visible component contributions. Higher is better. */
  score: number;
}
