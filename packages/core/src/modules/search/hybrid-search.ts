import {
  HybridSearchHit,
  HybridFusion,
  HybridTextComponent,
  HybridVectorComponent,
} from '../../interfaces/hybrid-search.interface';
import { TextSearchHit } from '../../interfaces/text-search.interface';
import { VectorSearchHit } from '../../interfaces/vector-search.interface';

interface ResolvedWeights {
  textWeight: number;
  vectorWeight: number;
}

export type ResolvedHybridFusion = ResolvedWeights & (
  | { rankConstant: number; strategy: 'rrf' }
  | { strategy: 'weighted-score' }
);

interface PendingHit<TDocument extends object> extends HybridSearchHit<TDocument> {
  id: string;
}

export const resolveHybridFusion = (fusion: HybridFusion = { strategy: 'rrf' }): ResolvedHybridFusion => {
  if (fusion.strategy !== 'rrf' && fusion.strategy !== 'weighted-score') {
    throw new Error(`Unknown hybrid fusion strategy: ${String((fusion as { strategy: unknown }).strategy)}`);
  }
  const textWeight = fusion.textWeight ?? 1;
  const vectorWeight = fusion.vectorWeight ?? 1;
  for (const [name, weight] of [['textWeight', textWeight], ['vectorWeight', vectorWeight]] as const) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Hybrid ${name} must be a non-negative finite number`);
  }
  if (textWeight === 0 && vectorWeight === 0) throw new Error('Hybrid search requires at least one positive weight');
  if (fusion.strategy === 'weighted-score') return { strategy: 'weighted-score', textWeight, vectorWeight };
  const rankConstant = fusion.rankConstant ?? 60;
  if (!Number.isFinite(rankConstant) || rankConstant <= 0) {
    throw new Error('Hybrid rankConstant must be a positive finite number');
  }
  return { rankConstant, strategy: 'rrf', textWeight, vectorWeight };
};

export const fuseHybridResults = <TDocument extends { _id: string }>(
  textHits: TextSearchHit<TDocument>[],
  vectorHits: VectorSearchHit<TDocument>[],
  fusion: ResolvedHybridFusion,
  limit: number,
): HybridSearchHit<TDocument>[] => {
  const hits = new Map<string, PendingHit<TDocument>>();
  const add = (document: TDocument): PendingHit<TDocument> => {
    let hit = hits.get(document._id);
    if (!hit) {
      hit = { components: {}, document, id: document._id, score: 0 };
      hits.set(document._id, hit);
    }
    return hit;
  };

  const bounds = (scores: number[]): { maximum: number; minimum: number } => {
    let maximum = Number.NEGATIVE_INFINITY;
    let minimum = Number.POSITIVE_INFINITY;
    for (const score of scores) {
      maximum = Math.max(maximum, score);
      minimum = Math.min(minimum, score);
    }
    return scores.length > 0 ? { maximum, minimum } : { maximum: 0, minimum: 0 };
  };
  const contribution = (
    scoreBounds: { maximum: number; minimum: number },
    score: number,
    rank: number,
    weight: number,
  ): number => {
    if (fusion.strategy === 'rrf') return weight / (fusion.rankConstant + rank);
    return weight * (scoreBounds.maximum === scoreBounds.minimum
      ? 1
      : (score - scoreBounds.minimum) / (scoreBounds.maximum - scoreBounds.minimum));
  };
  const textBounds = bounds(textHits.map(({ score }) => score));
  const vectorBounds = bounds(vectorHits.map(({ score }) => score));

  if (fusion.textWeight > 0) textHits.forEach((source, index) => {
    const rank = index + 1;
    const componentContribution = contribution(textBounds, source.score, rank, fusion.textWeight);
    const component: HybridTextComponent = {
      contribution: componentContribution,
      matchedTerms: source.matchedTerms,
      rank,
      score: source.score,
    };
    const hit = add(source.document);
    hit.components.text = component;
    hit.score += componentContribution;
  });

  if (fusion.vectorWeight > 0) vectorHits.forEach((source, index) => {
    const rank = index + 1;
    const componentContribution = contribution(vectorBounds, source.score, rank, fusion.vectorWeight);
    const component: HybridVectorComponent = { contribution: componentContribution, rank, score: source.score };
    const hit = add(source.document);
    hit.components.vector = component;
    hit.score += componentContribution;
  });

  const rank = (hit: PendingHit<TDocument>, component: 'text' | 'vector'): number =>
    hit.components[component]?.rank ?? Number.POSITIVE_INFINITY;
  return [...hits.values()]
    .sort((left, right) => right.score - left.score ||
      Math.min(rank(left, 'text'), rank(left, 'vector')) - Math.min(rank(right, 'text'), rank(right, 'vector')) ||
      rank(left, 'text') - rank(right, 'text') ||
      rank(left, 'vector') - rank(right, 'vector') ||
      left.id.localeCompare(right.id))
    .slice(0, limit)
    .map(({ components, document, score }) => ({ components, document, score }));
};
