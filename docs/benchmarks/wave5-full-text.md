# Wave 5 full-text search benchmark

Issue #4 uses an identical-workload before/after comparison. The raw pre-index
samples are retained in
[`text-search-baseline-node24-apple-m5.json`](./text-search-baseline-node24-apple-m5.json),
and the production-index samples are retained in
[`text-search-after-node24-apple-m5.json`](./text-search-after-node24-apple-m5.json).

## Workload

- Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory
- Filesystem and in-memory adapters
- 1,000, 10,000, and 100,000 deterministic documents
- Five independently recreated collections at each size
- Unicode NFKC/lowercase tokenization and BM25 reference ranking
- Selective all-term search, a common-term worst case, and selective search
  with a metadata-indexed pre-filter
- One cold query followed by repeated steady queries

Reproduce the workload with:

```sh
yarn benchmark:text --engine scan --sizes 1000,10000,100000 --iterations 5 --output text.json
```

## 100,000-document comparison

| Adapter | Operation | Scan | Indexed | Speedup |
| --- | --- | ---: | ---: | ---: |
| Filesystem | Cold selective search | 168.178 ms | 341.281 ms | 0.5× |
| Filesystem | Selective search | 140.609 ms | 3.859 ms | 36.4× |
| Filesystem | Common-term search | 158.980 ms | 137.895 ms | 1.2× |
| Filesystem | Metadata-filtered selective search | 52.028 ms | 16.853 ms | 3.1× |
| In-memory | Cold selective search | 61.164 ms | 218.853 ms | 0.3× |
| In-memory | Selective search | 61.070 ms | 1.858 ms | 32.9× |
| In-memory | Common-term search | 75.566 ms | 56.317 ms | 1.3× |
| In-memory | Metadata-filtered selective search | 7.798 ms | 6.712 ms | 1.2× |

The first indexed query rebuilds token frequencies and postings from committed
records, so cold construction is slower than a single scan and is reported
separately. The cost is amortized by repeated queries. Selective steady searches
are over 30× faster at 100,000 documents. Common-term output still loads and
returns the entire corpus in this hostile workload, so its improvement is
necessarily smaller. Metadata indexes intersect identities before record
loading; the full predicate is still evaluated for correctness.

## Browser-adapter comparison

The retained
[`browser baseline`](./text-search-browser-baseline-node24-apple-m5.json) and
[`browser indexed`](./text-search-browser-after-node24-apple-m5.json) reports run
the real IndexedDB and localStorage adapters against deterministic in-process
browser API implementations. This verifies adapter behavior and relative work;
it is explicitly not presented as browser wall-clock performance.

At 1,000 documents, steady selective search improves from 145.682 ms to 0.048
ms through the emulated IndexedDB adapter and from 1.184 ms to 0.138 ms through
localStorage. Common-term queries remain dominated by returning the full corpus.
The pure TypeScript index has no Node dependency and is also compiled by the
release browser-bundle smoke test, so applications can run it in a Web Worker.

Reproduce the browser-adapter comparison with:

```sh
yarn benchmark:text --engine scan --adapter indexeddb,localstorage --sizes 1000 --iterations 5 --output browser-scan.json
yarn benchmark:text --engine indexed --adapter indexeddb,localstorage --sizes 1000 --iterations 5 --output browser-indexed.json
```
