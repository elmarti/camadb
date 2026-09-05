# Inspectable hybrid retrieval

Hybrid retrieval combines the ranked keyword and exact-vector candidate sets without mixing their incomparable raw score scales.

```ts
const hits = await articles.searchHybrid({
  text: { query: 'durable embedded database', match: 'all' },
  vector: { field: 'embedding', query: queryEmbedding, metric: 'cosine' },
  filter: { category: 'database' },
  candidateLimit: 50,
  limit: 10,
  fusion: {
    strategy: 'rrf',
    rankConstant: 60,
    textWeight: 1,
    vectorWeight: 1,
  },
});
```

Every hit exposes the final score and each available component:

```ts
{
  document,
  score: 0.0325,
  components: {
    text: { rank: 2, score: 4.72, contribution: 0.0161, matchedTerms: ['durable'] },
    vector: { rank: 1, score: 0.91, contribution: 0.0164 },
  },
}
```

The component `score` is the original BM25 or vector score. `contribution` is the value added to the final score, making every ranking decision inspectable.

## Fusion strategies

`rrf` is the default and recommended strategy. Reciprocal-rank fusion computes each contribution as:

```text
weight / (rankConstant + rank)
```

It is robust when keyword and vector scores have unrelated distributions. `rankConstant` defaults to 60 and both weights default to 1.

`weighted-score` min-max normalizes each returned candidate set to 0–1 before applying `textWeight` and `vectorWeight`. It can emphasize score gaps but is more sensitive to outliers and to `candidateLimit`:

```ts
fusion: { strategy: 'weighted-score', textWeight: 1, vectorWeight: 2 }
```

Weights must be finite and non-negative, and at least one must be positive. A zero weight skips that component search entirely.

## Candidate depth and determinism

`limit` is the final top-k and defaults to 10. `candidateLimit` is requested independently from keyword and vector search and defaults to `max(50, limit × 5)`. Larger candidate sets improve fusion recall but increase vector top-k memory and the number of documents fetched for keyword results. Fusion is exact over the returned candidate sets, not over records outside that depth.

Equal final scores are resolved by best component rank, then text rank, vector rank, and document `_id`. Repeated searches over unchanged data are deterministic.

The same metadata filter is applied before both component searches. Include selective filter fields in the collection's `indexes` configuration. See the [hybrid benchmark report](./benchmarks/wave5-hybrid-search.md) for measured overhead and scaling.
