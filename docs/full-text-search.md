# Full-text search

Declare the top-level string fields that belong in a collection's keyword index,
then call `searchText`:

```ts
const articles = await database.initCollection<Article>('articles', {
  columns: [],
  indexes: ['category'],
  searchIndexes: ['title', 'body'],
});

const hits = await articles.searchText('local embedded database', {
  filter: { category: 'engineering' },
  match: 'all',
  limit: 10,
});

for (const hit of hits) {
  console.log(hit.document, hit.score, hit.matchedTerms);
}
```

Search field definitions are persisted with collection metadata. Index contents
are derived from committed records and rebuilt after reopening a collection or
observing an external revision. Failed mutations do not update the index.

## Matching and ranking

CamaDB normalizes text with Unicode NFKC, applies locale-independent lower case,
and recognizes contiguous Unicode letters and numbers as tokens. `match: 'any'`
is the default; use `match: 'all'` to require every distinct query term.

Results use deterministic BM25 ranking. Each hit contains:

- `document`: the stored typed document
- `score`: its keyword relevance score
- `matchedTerms`: the normalized query terms found in the document

Equal scores retain collection order. The first release deliberately does not
provide stemming, stop-word removal, fuzzy search, phrase matching, or prefix
expansion, so behavior remains portable and inspectable across runtimes.

The default limit is 20. `offset` and `limit` must be non-negative integers.
Metadata filters use configured metadata indexes when possible and are always
rechecked against fetched records, so an unsupported filter cannot change
correctness.

## Performance and suitability

The first query after opening a collection pays an O(n) index-build cost. Later
selective queries read only ranked candidate records, while common terms can
still require scoring many postings. Index memory is proportional to the number
of unique indexed tokens and their document postings.

Choose search fields narrowly. Do not index generated blobs, identifiers, or
text that is never searched. For corpora whose posting lists do not fit the
application's memory budget, or that require advanced linguistic analysis,
fuzzy matching, or disk-native indexes, use a dedicated search engine.

See the [reproducible benchmark report](benchmarks/wave5-full-text.md) and the
[search contract decision](decisions/0002-full-text-search.md).

