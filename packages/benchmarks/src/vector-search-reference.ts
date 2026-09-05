import { VectorMetric } from '@camadb/core';

interface Scored<T> {
  document: T;
  score: number;
  sequence: number;
}

export const vectorScore = (query: readonly number[], stored: readonly number[], metric: VectorMetric): number => {
  let dot = 0;
  let queryMagnitude = 0;
  let storedMagnitude = 0;
  let squaredDistance = 0;
  for (let index = 0; index < query.length; index += 1) {
    dot += query[index] * stored[index];
    if (metric === 'cosine') {
      queryMagnitude += query[index] ** 2;
      storedMagnitude += stored[index] ** 2;
    } else if (metric === 'euclidean') squaredDistance += (query[index] - stored[index]) ** 2;
  }
  if (metric === 'dot') return dot;
  if (metric === 'euclidean') return -Math.sqrt(squaredDistance) || 0;
  if (queryMagnitude === 0 || storedMagnitude === 0) return 0;
  return dot / Math.sqrt(queryMagnitude * storedMagnitude);
};

export const scanVectors = <T extends Record<string, any>>(
  documents: T[],
  field: string,
  query: readonly number[],
  metric: VectorMetric,
  limit: number,
): Array<{ document: T; score: number }> => documents
  .filter((document) => Array.isArray(document[field]) && document[field].length === query.length)
  .map((document, sequence): Scored<T> => ({
    document,
    score: vectorScore(query, document[field], metric),
    sequence,
  }))
  .sort((left, right) => right.score - left.score || left.sequence - right.sequence)
  .slice(0, limit)
  .map(({ document, score }) => ({ document, score }));
