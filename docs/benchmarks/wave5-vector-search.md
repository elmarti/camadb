# Wave 5 exact vector-search benchmark

Issue #84 adds bounded exact top-k vector search. The committed harness compares it with the previous application-level approach: hydrate matching documents, score every vector, sort every score, and slice the first k. Both engines run identical deterministic data, query vectors, operation order, and repetition counts.

## Reproduce

```sh
yarn benchmark:vector --sizes 1000,10000,100000 --iterations 5 --engine scan --output baseline.json
yarn benchmark:vector --sizes 1000,10000,100000 --iterations 5 --engine bounded --output after.json
yarn benchmark:vector --sizes 1000,10000,50000 --iterations 3 --adapter inmemory --dimensions 384 --engine bounded --output 384d.json
```

Raw samples and machine metadata are committed in:

- [`vector-search-baseline-node24-apple-m5.json`](./vector-search-baseline-node24-apple-m5.json)
- [`vector-search-after-node24-apple-m5.json`](./vector-search-after-node24-apple-m5.json)
- [`vector-search-384d-node24-apple-m5.json`](./vector-search-384d-node24-apple-m5.json)

Environment: Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory. The baseline comparison uses 32-dimensional vectors, top 10, five independent iterations, and ten searches per timed sample.

## Results at 100,000 records, 32 dimensions

| Adapter | Operation | Hydrate + sort | Bounded exact | Change |
| --- | --- | ---: | ---: | ---: |
| filesystem | cosine top 10 | 183.998 ms | 173.867 ms | 1.06× faster |
| filesystem | dot top 10 | 182.481 ms | 183.239 ms | effectively even |
| filesystem | Euclidean top 10 | 182.952 ms | 186.796 ms | 2.1% slower |
| filesystem | cosine, 1% metadata filter | 60.910 ms | 62.580 ms | 2.7% slower |
| in-memory | cosine top 10 | 15.133 ms | 4.878 ms | 3.10× faster |
| in-memory | dot top 10 | 15.306 ms | 4.741 ms | 3.23× faster |
| in-memory | Euclidean top 10 | 15.687 ms | 5.015 ms | 3.13× faster |
| in-memory | cosine, 1% metadata filter | 7.920 ms | 7.986 ms | effectively even |

Filesystem latency remains dominated by reading the exact candidate set. The bounded path materially reduces observed heap use at 100,000 records—for example, the cosine sample falls from about 114 MiB to 43 MiB—even where elapsed time is even. Heap deltas are noisy process observations, so use them as scaling evidence rather than retained-memory guarantees.

At 1,000 records, wrapper and validation overhead can add roughly 0.02–0.13 ms. At 10,000 records the bounded in-memory path is 1.5–1.6× faster; by 100,000 it is just over 3× faster. The filesystem path is effectively even at small sizes and avoids whole-result score arrays at large sizes.

## Realistic embedding dimensions

The separate 384-dimensional in-memory run measured:

| Records | Cosine top 10 | Dot top 10 | Euclidean top 10 | Cosine after 1% metadata filter |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.500 ms | 0.498 ms | 0.526 ms | 0.125 ms |
| 10,000 | 4.047 ms | 4.241 ms | 4.531 ms | 0.695 ms |
| 50,000 | 20.893 ms | 21.333 ms | 22.941 ms | 3.786 ms |

## Supported workload guidance

- Exact search is a good fit for tens of thousands of typical 384-dimensional vectors when roughly 20 ms in-memory latency is acceptable on comparable hardware.
- Selective metadata filters are the first scaling tool. Index the filter fields and apply them in `searchVector`.
- Benchmark the target browser and device. IndexedDB/localStorage correctness is covered, but Node emulation is not browser performance evidence.
- Use a dedicated vector database or an approximate-nearest-neighbour implementation when collections reach hundreds of thousands of high-dimensional vectors, when queries must consistently complete in single-digit milliseconds, or when concurrent vector queries make linear scans too expensive.
- Do not infer 768- or 1,536-dimensional latency from the 32-dimensional comparison; cost scales with both candidate count and dimensions. Run the committed harness with the actual dimension and workload.

The small filesystem timing regressions remain visible rather than being hidden. This feature's main scaling gain is bounded result memory; exact filesystem scoring is still linear I/O and is not described as an index.
