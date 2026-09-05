import { fuseHybridResults, resolveHybridFusion } from './hybrid-search';

const document = (id: string) => ({ _id: id, body: id, embedding: [1, 0] });

describe('hybrid search fusion', () => {
  it('returns original scores, ranks, contributions, and deterministic final order', () => {
    const first = document('first');
    const second = document('second');
    const third = document('third');
    const hits = fuseHybridResults(
      [
        { document: first, matchedTerms: ['first'], score: 8 },
        { document: second, matchedTerms: ['second'], score: 4 },
      ],
      [
        { document: second, score: 0.99 },
        { document: third, score: 0.75 },
      ],
      resolveHybridFusion({ strategy: 'rrf', rankConstant: 10, textWeight: 2, vectorWeight: 1 }),
      3,
    );

    expect(hits.map(({ document: row }) => row._id)).toEqual(['second', 'first', 'third']);
    expect(hits[0]).toMatchObject({
      components: {
        text: { contribution: 2 / 12, matchedTerms: ['second'], rank: 2, score: 4 },
        vector: { contribution: 1 / 11, rank: 1, score: 0.99 },
      },
      score: 2 / 12 + 1 / 11,
    });
  });

  it('uses explicit component ranks and document identity to resolve equal final scores', () => {
    const textOnly = document('z-text');
    const vectorOnly = document('a-vector');
    const hits = fuseHybridResults(
      [{ document: textOnly, matchedTerms: ['text'], score: 2 }],
      [{ document: vectorOnly, score: 1 }],
      resolveHybridFusion(),
      2,
    );
    expect(hits.map(({ document: row }) => row._id)).toEqual(['z-text', 'a-vector']);
  });

  it('validates the complete fusion configuration', () => {
    expect(resolveHybridFusion()).toEqual({
      rankConstant: 60,
      strategy: 'rrf',
      textWeight: 1,
      vectorWeight: 1,
    });
    expect(() => resolveHybridFusion({ strategy: 'rrf', rankConstant: 0 })).toThrow('positive finite');
    expect(() => resolveHybridFusion({ strategy: 'rrf', textWeight: -1 })).toThrow('non-negative finite');
    expect(() => resolveHybridFusion({ strategy: 'rrf', textWeight: 0, vectorWeight: 0 }))
      .toThrow('at least one positive weight');
  });

  it('supports min-max normalized weighted-score fusion', () => {
    const first = document('first');
    const second = document('second');
    const hits = fuseHybridResults(
      [
        { document: first, matchedTerms: ['first'], score: 10 },
        { document: second, matchedTerms: ['second'], score: 5 },
      ],
      [
        { document: second, score: 1 },
        { document: first, score: 0 },
      ],
      resolveHybridFusion({ strategy: 'weighted-score', textWeight: 1, vectorWeight: 2 }),
      2,
    );
    expect(hits.map(({ document: row }) => row._id)).toEqual(['second', 'first']);
    expect(hits[0]).toMatchObject({
      components: { text: { contribution: 0 }, vector: { contribution: 2 } },
      score: 2,
    });
  });
});
