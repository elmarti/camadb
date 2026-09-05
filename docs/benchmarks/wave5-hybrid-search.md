# Wave 5 hybrid-retrieval benchmark

Issue #85 compares native inspectable hybrid retrieval with manual application-level composition of the same CamaDB keyword and vector results. Both paths use reciprocal-rank fusion with rank constant 60, 50 candidates per component, final top 10, identical 32-dimensional vectors, and identical deterministic documents.

## Reproduce

```sh
yarn benchmark:hybrid --sizes 1000,10000,100000 --iterations 5 --engine manual --output baseline.json
yarn benchmark:hybrid --sizes 1000,10000,100000 --iterations 5 --engine native --output after.json
yarn benchmark:hybrid --sizes 1000,10000,100000 --iterations 5 --engine concurrent --output rejected-concurrent.json
```

Raw reports and machine metadata are retained in:

- [`hybrid-search-baseline-node24-apple-m5.json`](./hybrid-search-baseline-node24-apple-m5.json)
- [`hybrid-search-baseline-repeat-node24-apple-m5.json`](./hybrid-search-baseline-repeat-node24-apple-m5.json)
- [`hybrid-search-after-node24-apple-m5.json`](./hybrid-search-after-node24-apple-m5.json)
- [`hybrid-search-rejected-concurrent-node24-apple-m5.json`](./hybrid-search-rejected-concurrent-node24-apple-m5.json)

Environment: Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory. Five independent iterations were run for every adapter and collection size. Cold searches run once per seeded collection; steady workloads run ten times per timed sample.

## Adjacent-run results at 100,000 records

| Adapter | Workload | Manual composition | Native hybrid | Change |
| --- | --- | ---: | ---: | ---: |
| filesystem | cold balanced | 472.792 ms | 467.872 ms | 1.01× faster |
| filesystem | steady balanced | 184.885 ms | 180.989 ms | 1.02× faster |
| filesystem | 1% metadata filter | 67.045 ms | 65.804 ms | 1.02× faster |
| filesystem | text weighted | 188.716 ms | 187.781 ms | effectively even |
| in-memory | cold balanced | 93.369 ms | 93.537 ms | effectively even |
| in-memory | steady balanced | 6.759 ms | 6.439 ms | 1.05× faster |
| in-memory | 1% metadata filter | 9.942 ms | 9.600 ms | 1.04× faster |
| in-memory | text weighted | 6.604 ms | 6.448 ms | 1.02× faster |

The first manual filesystem run was 4–7% faster than both adjacent runs at 100,000 records, demonstrating ordinary filesystem/process variance. It is retained rather than discarded. The adjacent repeat shows native fusion adds no material latency; most time remains in the two component searches.

Concurrent component reads made 100,000-record cold filesystem retrieval roughly 3–10% slower across retained runs through I/O contention and exposed concurrent derived-index rebuilds. Some steady concurrent samples were faster, but the cold penalty and browser uncertainty made it an unsafe default. Production serializes component reads for storage-backed adapters, retains the resident in-memory fast path, and coalesces concurrent metadata/full-text index refreshes. Adapter conformance verifies the deterministic result set.

## Guidance

- Hybrid latency is approximately keyword-search latency plus exact-vector latency. Fusion over 50+50 candidates is negligible.
- Metadata filtering is the most effective way to reduce exact-vector work and should be applied once at the hybrid API boundary.
- Increasing `candidateLimit` improves potential fusion recall but makes vector selection and keyword document loading more expensive.
- Browser adapters pass the same behavior suite, but these are Node filesystem/in-memory measurements and are not browser wall-clock claims.
- For hundreds of thousands of high-dimensional vectors or strict single-digit-millisecond targets, use an ANN-capable vector database and retain CamaDB for local metadata or offline subsets.
