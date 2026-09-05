# Wave 5 metadata-index benchmarks

Issue #3 is governed by an identical-workload before/after comparison. The raw
pre-index samples are retained in
[`index-baseline-node24-apple-m5.json`](./index-baseline-node24-apple-m5.json),
and the implementation samples are retained in
[`index-after-node24-apple-m5.json`](./index-after-node24-apple-m5.json).

## Workload

- Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory
- Filesystem and in-memory adapters
- 1,000, 10,000, and 100,000 deterministic records
- Five independently seeded iterations at each size
- Equality on `group`, a bounded range on `score`, their intersection, and an
  unindexed missing-value control
- One cold equality count followed by repeated steady-state counts
- The declared metadata indexes are `group` and `score`; this baseline predates
  their implementation, so every non-identity query scans

Reproduce the workload with:

```sh
yarn benchmark:index --sizes 1000,10000,100000 --iterations 5 --output index.json
```

## 100,000-record comparison

| Adapter | Operation | Before | Indexed | Speedup |
| --- | --- | ---: | ---: | ---: |
| Filesystem | Cold equality count | 113.736 ms | 196.029 ms | 0.6× |
| Filesystem | Equality count | 80.033 ms | 3.879 ms | 20.6× |
| Filesystem | Range count | 81.597 ms | 5.912 ms | 13.8× |
| Filesystem | Equality/range intersection | 87.152 ms | 1.028 ms | 84.8× |
| Filesystem | Unindexed missing-value control | 81.989 ms | 77.978 ms | 1.1× |
| In-memory | Cold equality count | 5.854 ms | 84.176 ms | 0.1× |
| In-memory | Equality count | 4.162 ms | 1.804 ms | 2.3× |
| In-memory | Range count | 4.264 ms | 3.789 ms | 1.1× |
| In-memory | Equality/range intersection | 9.621 ms | 0.993 ms | 9.7× |
| In-memory | Unindexed missing-value control | 4.726 ms | 4.661 ms | 1.0× |

The first indexed query rebuilds both declared indexes from committed records,
so it is deliberately reported separately and is slower than a one-off scan.
The cost is amortized by subsequent indexed queries. Applications dominated by
single cold queries should not add indexes; frequently queried persistent
collections receive the largest benefit.

The implementation materially improves every steady indexed case at 100,000
records, most strongly for persistent storage and selective intersections. The
unindexed control remains a scan without material regression. Correct counts,
write maintenance, index recovery, and bounded storage behavior remain hard
gates; timing alone cannot promote an implementation.
