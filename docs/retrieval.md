# Choosing a retrieval strategy

| Question                              | API                  | Configure                             |
| ------------------------------------- | -------------------- | ------------------------------------- |
| Exact fields or ranges                | `findMany` / `count` | `indexes` on top-level scalars        |
| Words appearing in text               | `searchText`         | `searchIndexes`                       |
| Similar vectors                       | `searchVector`       | `vectorIndexes` with fixed dimensions |
| Combined keyword and semantic ranking | `searchHybrid`       | Text and vector indexes               |

## A runnable small-vector example

The numeric vectors below are deliberately hand-written to demonstrate the API; use a consistent embedding model for semantic search in an application.

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Article {
  _id: string;
  topic: string;
  body: string;
  embedding: number[];
}
const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
const articles = await db.initCollection<Article>('articles', {
  columns: [],
  indexes: ['topic'],
  searchIndexes: ['body'],
  vectorIndexes: [{ field: 'embedding', dimensions: 3 }],
});
await articles.insertMany([
  { topic: 'storage', body: 'Local database recovery', embedding: [1, 0, 0] },
  { topic: 'search', body: 'Keyword search and ranking', embedding: [0, 1, 0] },
]);
const text = await articles.searchText('database', { match: 'all', limit: 5 });
const vector = await articles.searchVector('embedding', [1, 0.1, 0], { limit: 5 });
const hybrid = await articles.searchHybrid({
  text: { query: 'database' },
  vector: { field: 'embedding', query: [1, 0.1, 0] },
  limit: 5,
});
console.log(text, vector, hybrid);
```

Text hits report BM25 scores and normalized matched terms. Vector hits report similarity for the configured metric. Hybrid results retain component ranks and fusion contributions so your UI can explain why a result appeared. Scores are ranking signals, not calibrated probabilities.

Exact vectors scan eligible vectors rather than using approximate nearest-neighbor search. Index construction and storage have costs; measure on representative payloads and devices. Full-text tokenization is deterministic and intentionally narrower than a general language-understanding service.

For filters, metrics, zero vectors, candidate limits, fusion tuning and recovery details, read [metadata indexes](indexes.md), [full text](full-text-search.md), [vectors](vector-search.md), and [hybrid retrieval](hybrid-search.md).

## Add provenance for AI memory

Use [@camadb/memory](../packages/memory/README.md) when vectors need provider/model/schema provenance, expiry and a memory lifecycle. It rejects incompatible embedding spaces before retrieval. CamaDB does not generate embeddings unless your application supplies a provider. Changing providers requires explicit re-embedding; matching dimensions alone does not establish compatibility.
