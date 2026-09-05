# Wave 5 metadata-index benchmarks

Issue #3 is governed by an identical-workload before/after comparison. The raw
pre-index samples are retained in
[`index-baseline-node24-apple-m5.json`](./index-baseline-node24-apple-m5.json).

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

## 100,000-record baseline medians

| Adapter | Operation | Time per query |
| --- | --- | ---: |
| Filesystem | Cold equality count | 113.736 ms |
| Filesystem | Equality count | 80.033 ms |
| Filesystem | Range count | 81.597 ms |
| Filesystem | Equality/range intersection | 87.152 ms |
| Filesystem | Unindexed missing-value control | 81.989 ms |
| In-memory | Cold equality count | 5.854 ms |
| In-memory | Equality count | 4.162 ms |
| In-memory | Range count | 4.264 ms |
| In-memory | Equality/range intersection | 9.621 ms |
| In-memory | Unindexed missing-value control | 4.726 ms |

The indexed implementation must materially improve the declared equality and
range cases at 100,000 records. The unindexed control must remain a scan and may
not regress materially. Correct counts, write maintenance, index recovery, and
bounded storage behavior remain hard gates; timing alone cannot promote an
implementation.
