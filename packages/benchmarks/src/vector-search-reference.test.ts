import { scanVectors, vectorScore } from './vector-search-reference';

describe('vector search reference', () => {
  it('defines the exact score conventions used by both benchmark engines', () => {
    expect(vectorScore([1, 0], [1, 0], 'cosine')).toBe(1);
    expect(vectorScore([2, 0], [1, 0], 'dot')).toBe(2);
    expect(vectorScore([1, 0], [0, 0], 'euclidean')).toBe(-1);
  });

  it('sorts higher scores first and preserves source order for ties', () => {
    const rows = [
      { _id: 'first', embedding: [1, 0] },
      { _id: 'second', embedding: [1, 0] },
      { _id: 'third', embedding: [-1, 0] },
    ];
    expect(scanVectors(rows, 'embedding', [1, 0], 'cosine', 2).map(({ document }) => document._id))
      .toEqual(['first', 'second']);
  });
});
