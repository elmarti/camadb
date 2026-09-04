# Wave 4: measured storage and remaining limits

## Filesystem follow-up: append-segment integration

The immutable-page filesystem results below are retained because they explain
why #83 was reopened. The production filesystem adapter now uses the
benchmark-selected checksummed append segment. Fresh five-sample runs at 10,000
records, repeated in reversed implementation order, measured:

| Operation | Append segment, runs 1 / 2 | Superseded pages, runs 1 / 2 |
| --- | ---: | ---: |
| Bulk insert | 31.4 / 30.7 ms | 774.7 / 708.8 ms |
| Point read | 0.519 / 0.395 ms | 0.888 / 0.761 ms |
| Point update | 4.60 / 4.23 ms | 25.52 / 25.59 ms |
| Point delete | 3.89 / 3.82 ms | 19.03 / 17.61 ms |

The append segment also beats the original 33.8 ms whole-collection bulk
baseline in both run orders. Eleven-sample mixed runs measured point reads at
0.055–0.056 ms, full reads at 6.03–6.12 ms, filtered reads at 7.34–7.47 ms,
and reopen plus point read at 0.380–0.399 ms. Every corresponding page-adapter
median was slower: 0.215–0.217, 17.77–18.21, 18.66–19.01, and 0.423–0.456 ms.

Raw reports are retained under `docs/benchmarks/speed-lab` with the
`fs-production-final-*`, `fs-record-pages-*`, `fs-mixed-production-final-*`,
and `fs-mixed-record-pages-*` prefixes. The remainder of this document is the
historical Wave 4 report and must not be mistaken for the current filesystem
implementation.

## Reproduction and scope

The original storage harness (`packages/benchmarks/src/run.ts` and `config.ts`) is unchanged. The baseline was captured before #83/#53; the comparison uses `develop` commit `65dd30b`, after both implementations merged. Both reports use Node **24.20.0**, Apple **M5 arm64**, macOS, **24 GiB** RAM, the same small deterministic documents, sizes **100/1,000/10,000**, and **five repetitions**. These are separate runs on the same machine, not a controlled hardware laboratory or simultaneous A/B experiment.

```sh
yarn benchmark:storage --sizes 100,1000,10000 --iterations 5 --output docs/benchmarks/after-wave4-node24-apple-m5.json
yarn benchmark:cache --sizes 100,1000,10000 --iterations 5 --output docs/benchmarks/cache-wave4-node24-apple-m5.json
```

Raw samples: [baseline](./baseline-node24-apple-m5.json), [after storage/cache implementation](./after-wave4-node24-apple-m5.json), and [separate cache workloads](./cache-wave4-node24-apple-m5.json). Caching is **disabled** in the unchanged storage comparison. Run workloads sequentially, with other heavy jobs stopped; both commands build first and then run Node with `--expose-gc`. Each sample uses fresh temporary collections, and setup/seeding is outside point-operation measurements. Reads use an already-seeded collection, not a cold OS cache or a reopened process. The baseline measures one operation per sample and reports medians, not throughput or tail-latency guarantees.

## Filesystem results

Times are milliseconds; heap deltas are KiB (1,024 bytes), rounded. Each cell is **before → after**.

| Records | Operation    |        Time (ms) | Heap delta (KiB) |
| ------: | ------------ | ---------------: | ---------------: |
|     100 | Bulk insert  | 25.476 → 171.385 |      242 → 3,129 |
|     100 | Point read   |    0.325 → 0.832 |          24 → 90 |
|     100 | Point update |   8.020 → 25.432 |        149 → 222 |
|     100 | Point delete |   8.156 → 17.034 |        156 → 191 |
|   1,000 | Bulk insert  | 27.287 → 574.398 |    1,309 → 5,057 |
|   1,000 | Point read   |    0.792 → 0.745 |         22 → 184 |
|   1,000 | Point update |  10.899 → 25.695 |      1,014 → 416 |
|   1,000 | Point delete |   9.937 → 17.320 |      1,047 → 401 |
|  10,000 | Bulk insert  | 33.849 → 702.115 |   11,946 → 4,674 |
|  10,000 | Point read   |    1.319 → 0.782 |         52 → 195 |
|  10,000 | Point update |  17.355 → 25.826 |      9,497 → 461 |
|  10,000 | Point delete |  17.456 → 17.736 |      9,757 → 429 |

At 10,000 records, point-update and point-delete heap deltas are about **95% lower**, and elapsed point-mutation time is much flatter over these sizes. This supports the intended reduction in whole-collection work for filesystem identity operations. It does **not** prove constant-memory behavior at arbitrarily large sizes: locator shards grow as records are added.

There are material costs. At 10,000 records, bulk insertion is **20.7× slower**, point update **1.49× slower**, and point delete approximately unchanged. At small sizes, most operations regress. The new layout writes immutable pages and locator shards with durable publication; file count, metadata, and synchronization overhead are plausible contributors, not a profiled allocation of the slowdown.

The 10,000-record collection after bulk insertion grew from **766,823 bytes** to **1,838,821 bytes** (about **2.4×**). This is logical file length, not allocated disk blocks. The workload is below default compaction thresholds and does not represent sustained churn or compaction latency. The bytes after a point update include newly obsolete files; they are not a measurement of the compacted minimum footprint.

## In-memory results

For 10,000 records, median times (ms) are:

| Operation    | Before | After |
| ------------ | -----: | ----: |
| Bulk insert  |  0.659 | 0.949 |
| Point read   |  1.216 | 0.227 |
| Point update |  0.904 | 0.611 |
| Point delete |  1.090 | 0.541 |

The in-memory adapter still stores an array and scans it for identities. Faster results here do not establish an indexed or bounded-memory implementation. Its point-update heap delta increased from 35,432 to 348,800 bytes; the filesystem memory improvement must not be generalized to every adapter.

## Separate cache workloads

The new cache harness does **not** replace or modify the before/after workload. Each sample seeds a new collection, clears its cache, separately measures eager warming, and performs **256 sequential identity reads**, validating every returned document. The hot set cycles through 32 identities; the scan cycles through `min(size, 128)` identities. Budgets are **64 records / 64 KiB** per handle; this small-payload workload exercises the record limit, not the byte limit. Modes rotate order across five repetitions. Seeding, destruction, and eager warm-up are outside the timed read loop; correctness checks are inside it. No OS cache flush, simultaneous writes, or process isolation per sample is attempted.

At 10,000 records, the table reports the median **batch-average ms per read**, not p50 of individually timed reads. Warm-up is separately timed in milliseconds. Hits/misses and evictions cover the read loop only.

| Adapter | Workload | Mode     | Warm-up ms | ms/read | Hits / misses | Evictions |
| ------- | -------- | -------- | ---------: | ------: | ------------: | --------: |
| FS      | Hot      | disabled |      0.003 |  0.2299 |             — |         0 |
| FS      | Hot      | eager    |     16.788 |  0.1295 |       256 / 0 |         0 |
| FS      | Hot      | lazy     |      0.003 |  0.1093 |      224 / 32 |         0 |
| FS      | Hot      | LRU      |      0.003 |  0.1058 |      224 / 32 |         0 |
| FS      | Scan     | disabled |      0.002 |  0.2316 |             — |         0 |
| FS      | Scan     | eager    |     16.244 |  0.2663 |     128 / 128 |         0 |
| FS      | Scan     | lazy     |      0.003 |  0.2821 |      64 / 192 |         0 |
| FS      | Scan     | LRU      |      0.003 |  0.3568 |       0 / 256 |       192 |
| Memory  | Hot      | disabled |      0.002 |  0.0900 |             — |         0 |
| Memory  | Hot      | eager    |      0.113 |  0.0052 |       256 / 0 |         0 |
| Memory  | Hot      | lazy     |      0.002 |  0.0191 |      224 / 32 |         0 |
| Memory  | Hot      | LRU      |      0.002 |  0.0189 |      224 / 32 |         0 |
| Memory  | Scan     | disabled |      0.002 |  0.0904 |             — |         0 |
| Memory  | Scan     | eager    |      0.123 |  0.0581 |     128 / 128 |         0 |
| Memory  | Scan     | lazy     |      0.003 |  0.0851 |      64 / 192 |         0 |
| Memory  | Scan     | LRU      |      0.002 |  0.1093 |       0 / 256 |       192 |

FS hot-set LRU reads are about **2.2× faster** here, but the over-capacity scan is **1.54× slower** than disabled mode. Eager warm-up must be added when evaluating short sessions; its 16.8 ms cost is not free. These are cache-shape trade-offs, not grounds for enabling caching universally. Disabled mode does not count cache hits/misses. Resident caches stayed within both budgets; 10,000-record samples retained 0–64 records and at most 3,476 accounted bytes. Byte-budget eviction and oversized-record bypass are covered by correctness tests, not this performance workload.

## Memory interpretation

Heap delta is `heapUsed` immediately after an operation minus the value after a pre-operation forced GC. It is **neither peak allocation nor retained heap**, excludes external/native allocations, and may be affected by GC during the operation. Cache `bytes` counts retained serialized JSON payloads and identities, not process heap. The baseline process also retains earlier operation handles within each iteration. These are diagnostic scaling measurements, not a hard memory SLA.

## Supported-workload guidance

The measured envelope is **100–10,000 small records on one Node/macOS machine**, using single-record string-identity operations and fresh bulk inserts. Treat 10,000 as the largest tested point here, **not** a hard capacity maximum or a blanket production guarantee. Browser IndexedDB/localStorage, large document payloads, sustained concurrent traffic, slow disks, and prolonged compaction churn were not performance-tested in this matrix. Their correctness tests do not establish performance limits.

- For local prototypes and modest document collections, validate the actual payload sizes and query mix against these commands before choosing budgets.
- For filesystem identity-heavy workloads, record-oriented persistence avoids full document hydration, but affected locator shards still grow. Keep latency headroom for writes and compaction.
- For cache sizing, use an explicit per-handle byte **and** record budget. Multiply by open collection handles. Prefer disabled/lazy/LRU over eager when total memory matters.
- For large scans, broad updates/deletes, aggregation, or strict memory limits, do not assume `limit` or the cache budget bounds processing. Current queries materialize collection data before filtering/limiting; broad mutations use replacement paths and can exceed the 10,000-record mutation limit.
- Filesystem/IndexedDB write batches have a 10,000-record limit and serialized page/record checks around 1 MiB. This bounds submitted batch count/payload, not total adapter metadata or total process memory. localStorage does not enforce the same page-byte check; its manifest grows with the collection and quota is controlled by the browser.
- For local applications needing SQL, indexed query planning, and mature on-disk storage rather than maintaining custom file layouts, evaluate **SQLite**. For many independent concurrent writers or shared network access, evaluate a client/server database instead. This is an architectural recommendation, not a head-to-head performance claim; see [SQLite's own selection guidance](https://www.sqlite.org/whentouse.html).

## Wave 4 exit audit

**Implemented and covered by correctness tests:** record-level identity paths, explicit legacy-format detection/migration facilities, interrupted-write and compaction recovery, automatic reclamation, and cache modes/invalidation across all adapters. The reproducible Node before/after measurements are now recorded.

**Still short of the original scalable-storage gate:**

1. Full queries and broad mutations still hydrate collections; `limit` is applied after hydration.
2. Filesystem iteration/compaction gathers all locator metadata; IndexedDB iteration materializes and sorts records before yielding; localStorage retains a collection-wide manifest. These are not collection-size-independent streaming bounds.
3. In-memory identity operations remain array scans. Filesystem locator shards also grow beyond this tested range.
4. No browser performance, sustained-churn/compaction performance, peak-memory, or large-payload capacity claim is established here.

Therefore this report finishes the benchmark comparison but does **not** declare Wave 4's strict bounded-memory/bulk-processing gate complete. Bounded adapter iteration and streaming query/bulk processing need a follow-up before search work can honestly rely on that guarantee. The bulk-insert regression also merits profiling before larger-scale workload promises. Everything remains on `develop`; no release is made by this work.
