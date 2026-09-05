# Exact vector search

CamaDB can store numeric vectors and rank exact nearest neighbours locally. Declare each vector field and its fixed dimensions when opening a collection:

```ts
interface Article {
  title: string;
  category: string;
  embedding: number[];
}

const articles = await database.initCollection<Article>('articles', {
  columns: [],
  indexes: ['category'],
  vectorIndexes: [{ field: 'embedding', dimensions: 384 }],
});

const hits = await articles.searchVector('embedding', queryEmbedding, {
  filter: { category: 'database' },
  limit: 10,
  metric: 'cosine',
});
```

The field argument is restricted at compile time to numeric-array fields in the collection document type. Stored vectors and queries must contain exactly the configured number of finite numeric components. Invalid writes are rejected before storage is changed, and invalid queries report the expected and received dimensions.

## Metrics and result order

- `cosine` is the default. It returns cosine similarity and rejects a zero-magnitude query. A stored zero vector scores `0`.
- `dot` returns the dot product.
- `euclidean` returns the negated Euclidean distance.

Every metric therefore follows one rule: a higher `score` is a better match. Equal scores retain storage order, so repeated searches are deterministic. `limit` selects the exact top-k and defaults to 10.

## Execution and memory

This is exact search, not an approximate nearest-neighbour index. Search cost is linear in `candidate count × dimensions`. CamaDB scans authoritative committed records and retains only O(k) ranked candidates. A metadata filter uses configured metadata indexes before vectors are loaded; include selective filter fields in `indexes`.

In-memory collections use their resident array directly. Filesystem collections stream records rather than hydrating the complete collection. IndexedDB and localStorage use their real adapter record APIs, but the committed performance figures are Node measurements and should not be read as browser wall-clock claims.

See the [vector benchmark report](./benchmarks/wave5-vector-search.md) for measured latency and workload guidance.
