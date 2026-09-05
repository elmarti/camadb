# Wave 5 full-text search benchmark

Issue #4 uses an identical-workload before/after comparison. The raw pre-index
samples are retained in
[`text-search-baseline-node24-apple-m5.json`](./text-search-baseline-node24-apple-m5.json).

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
yarn benchmark:text --sizes 1000,10000,100000 --iterations 5 --output text.json
```

## 100,000-document baseline medians

| Adapter | Operation | Time per query |
| --- | --- | ---: |
| Filesystem | Cold selective search | 168.178 ms |
| Filesystem | Selective search | 140.609 ms |
| Filesystem | Common-term search | 158.980 ms |
| Filesystem | Metadata-filtered selective search | 52.028 ms |
| In-memory | Cold selective search | 61.164 ms |
| In-memory | Selective search | 61.070 ms |
| In-memory | Common-term search | 75.566 ms |
| In-memory | Metadata-filtered selective search | 7.798 ms |

The production index must materially improve steady selective search without
changing ranking or filtering semantics. Common-term output necessarily loads
many records, so its candidate-loading cost is reported separately rather than
hidden. Cold index construction, mutation maintenance, recovery, and memory
growth remain release gates even when steady query latency improves.

