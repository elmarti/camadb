# Wave 6 local-first memory baseline

Issue #86 introduces a new `@camadb/memory` execution path, so there is no earlier memory API to claim an improvement against. This report establishes the reproducible floor that subsequent Wave 6 work must match or improve. It does not replace the lower-level text, vector, or hybrid baselines.

## Method

- Node.js 24.20.0, Apple M5 arm64, macOS, 24 GiB memory
- Filesystem and in-memory adapters
- 100, 1,000, and 10,000 records; five independent iterations
- Deterministic 32-dimensional caller-produced embeddings
- Provider startup, inference, and network time excluded
- One batch-ingest sample, 100 point inspections, and 10 searches per timed sample
- Default expiry filtering retained so the workload represents the public API

Reproduce it on an otherwise idle machine:

```sh
yarn benchmark:memory --sizes 100,1000,10000 --iterations 5 --output memory.json
```

The complete samples and environment metadata are retained in [`memory-api-baseline-node24-apple-m5.json`](./memory-api-baseline-node24-apple-m5.json).

## 10,000-record medians

| Adapter   | Operation       | Per operation | Observed heap delta |
| --------- | --------------- | ------------: | ------------------: |
| filesystem | batch remember |     86.195 ms |            25.5 MiB |
| filesystem | inspect        |      0.054 ms |             2.3 MiB |
| filesystem | text recall    |     19.974 ms |            11.1 MiB |
| filesystem | vector recall  |     24.210 ms |            30.0 MiB |
| filesystem | hybrid recall  |     47.219 ms |            46.1 MiB |
| in-memory  | batch remember |     24.745 ms |            42.7 MiB |
| in-memory  | inspect        |      0.036 ms |             1.2 MiB |
| in-memory  | text recall    |      0.523 ms |             7.7 MiB |
| in-memory  | vector recall  |      1.554 ms |            18.5 MiB |
| in-memory  | hybrid recall  |      3.413 ms |            64.5 MiB |

## Interpretation and gate

Point inspection stays effectively flat across the measured 100–10,000-record range because it uses the record identity path. Recall still inherits the exact-search scaling documented in Wave 5: filesystem work is dominated by storage reads, while resident in-memory search is substantially faster. Hybrid recall is intentionally composed from both result sets and costs more than either component alone.

Heap delta is the process heap after a repeated workload minus the heap after a forced pre-workload collection. It is not peak or retained memory, and repeated searches contribute allocations to the same sample. Treat it as scaling evidence, not a memory SLA.

Future changes pass this gate only when they use this unchanged workload and show no material regression after accounting for normal run variance. Provider benchmarks must report model, runtime, warm-up, dimensions, and whether inference is local; they must not be mixed into this provider-independent database baseline.
