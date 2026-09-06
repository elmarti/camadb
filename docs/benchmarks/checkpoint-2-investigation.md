# dbcurious checkpoint 2: CamaDB performance investigation

Investigated on 2026-09-06 on the test Mac: Apple M5, 10 logical CPUs,
24 GiB RAM, Darwin 25.6 arm64, Node 24.20.0. Consumer checkout verified as
`codex/checkpoint-2`, `929bb6b5cc13874dab4af661cab606224959a1cb`, using
`@camadb/core@0.0.0-alpha-20260906181433`. Evidence reviewed:
`docs/checkpoint-2.md`, `docs/benchmarks/checkpoint-2.json`,
`tooling/benchmarks/snapshots.mjs`, storage, local ordering, ingestion and
recovery code in `/Users/elmarti/Projects/dbcurious`.

**Result:** the consumer's 100k narrow envelope reproduces. Million-row
ingestion fails the RSS safety gate even without PostgreSQL and with the
record cache disabled. Allocation sampling implicates locator checkpoint
construction and shard loading, not a growing record cache. A small buffered
replay fix reduces ordinary cold page reads below 250 ms without previews or
an on-disk change. Bounded-memory queries and checkpoint construction remain
follow-up work; million-row support is not established.

## Reproduction and measurement boundaries

The supplied consumer benchmark ran unchanged against its disposable Docker
PostgreSQL fixture. It writes only temporary synthetic stores and a new report;
the consumer checkout, lockfile, operation limits and original evidence were
not edited. [Raw reproduction](checkpoint-2/consumer-reproduction.json):

| Requested / shape | Committed | Capture s | Preview first page ms | Filter/sort ms | Peak RSS MiB |
| ----------------- | --------: | --------: | --------------------: | -------------: | -----------: |
| 10k narrow        |    10,000 |      1.08 |                  12.4 |          257.6 |        128.6 |
| 10k wide          |    10,000 |      1.28 |                  20.4 |          315.4 |        185.1 |
| 100k narrow       |   100,000 |     11.08 |                  34.6 |        1,145.7 |        330.7 |
| 100k wide         |   100,000 |     11.79 |                  21.0 |     Restricted |        208.0 |
| 1m narrow         |   639,900 |     73.32 |               Stopped |        Stopped |        770.2 |
| 1m wide           |   511,900 |     60.46 |               Stopped |        Stopped |        804.0 |

Wide 100k exceeds the normal 100 MiB capture envelope; its 15-row preview is
not equivalent to a 100-row ordinary page. Million runs use the supplied
benchmark-only overrides and 768 MiB safety stop. Sampling can overshoot, and
the reported committed count can lag the final write. These are process RSS
measurements, not total Electron application memory. Cold means a new service
or collection handle, not a flushed OS page cache. No percentile claims.

An additional [public-API harness](../../scripts/checkpoint-2/profile.mjs)
removes PostgreSQL, disk-space checks, per-batch query metadata/preview writes
and polling. It generates the same source values and ordinal row documents,
awaits 100-row `insertMany` calls, and configures the same lookup index and
8 MiB / 1,000-record LRU. Each case is a fresh Node process with a 512 MiB
old-space cap. It records RSS, heap used/total, external bytes, ArrayBuffer
bytes, public cache/storage statistics, batch samples and OS maximum RSS.
ArrayBuffer bytes are included in external bytes; do not sum them.

For page isolation, it releases the writer handle and explicitly GCs outside
timed regions, then reads 100 ordinal IDs through `findMany`. The original
consumer keeps its service reachable after disconnect, so its total RSS is
not directly comparable. The harness cold indexed view follows the cold page;
its unindexed view follows the indexed view and has warm locators. Neither is
an independent cold query. Its sort uses descending ordinal position, which
has the exact same order as amount for this positive monotonic fixture; it
does **not** benchmark dbcurious's general exact-decimal comparator. The
unchanged consumer benchmark and semantic tests cover that comparator.

Timing cases run sequentially, without allocation profiling. Allocation
sampling is a separate opt-in run and includes collected objects, so sampled
byte totals represent allocation churn, not simultaneous live memory.

## Memory: what is established

The isolated million-requested narrow workload also stops at the RSS ceiling:

| Case                               | Committed rows | Capture s | Peak sampled RSS MiB | Peak heap used MiB | Peak external MiB | Heap after GC MiB |
| ---------------------------------- | -------------: | --------: | -------------------: | -----------------: | ----------------: | ----------------: |
| LRU, allocation sampling enabled   |        537,600 |     29.81 |                848.5 |              207.5 |              69.2 |              17.3 |
| Record cache disabled, no sampling |        563,200 |     30.04 |                847.9 |              199.7 |              71.2 |               7.6 |

See [allocation samples](checkpoint-2/allocations-million-lru.json) and
[disabled-cache control](checkpoint-2/baseline-million-disabled.json).
Do not compare these two timings as an LRU speed test: profiling changes
overhead and GC behavior. Both runs stopped exactly at a 25,600-row checkpoint
boundary. The record cache reports **zero retained records and bytes** at
capture completion. Mutations invalidate it; duplicate-ID probes miss for
new rows. The configured secondary index is lazy and has not been built by
an indexed result query during ingestion.

The largest individual sampled allocation stacks are:

- `materializeIndex`: approximately 1.12 GB cumulative sampled allocation,
  plus approximately 453 MB in its `Map.set` child.
- `loadShard`: approximately 836 MB, plus Map/JSON/string allocation stacks.
- `encodeCheckpoint`: approximately 612 MB, plus iterator allocation stacks.
- `getRecords`, `mutateNow`, input copying and frame encoding also allocate;
  cached input copying accounts for approximately 216 MB in one stack.

These observations match the filesystem implementation:

1. `loadShard` caches locator Maps independently of the public record-cache
   budget. Explicit-ID duplicate checks and writes eventually touch the shards.
2. Every 256 small commits, `append` materializes another complete locator Map,
   groups it into entry arrays, JSON-encodes all shards to Buffers, and then
   concatenates frames, checkpoints and footer into another output Buffer.
   A batch of at least 512 frames checkpoints immediately, so increasing the
   consumer batch size can make checkpoint frequency dramatically worse.
3. Checkpoint publication clears the overlay and shard cache, but a later
   write reloads shards. This creates repeated allocations proportional to
   collection size, even though incoming batches are bounded.
4. Old checkpoints remain in the segment. Pure ingestion adds little to
   `reclaimableBytes` despite obsolete checkpoint payloads. At 563,200 narrow
   rows, total disk is 488.1 MiB while the reported reclaimable bytes are only
   about 1.4 MiB. The present live/reclaimable statistics under-account this
   overhead; the checkpoint layout and accounting need attention together.

After GC, RSS can remain high (783 MiB in the disabled case) despite a small
heap. RSS includes native allocator retention, V8 committed space, code,
stacks and other runtime memory; JS allocation sampling does not fully
attribute that residual. Native allocator fragmentation/retention is a
plausible contributor, not a proven leak diagnosis. Instruments/malloc-zone
profiling is a follow-up if RSS remains high after reducing checkpoint churn.
There is no evidence here that an 8 MiB cache setting is a process-memory cap,
or that PostgreSQL backpressure failure is required to reproduce the issue.

## Cold reads: implemented fix and limits

`SegmentPersistence.recover` starts from a locator checkpoint and replays the
tail. With 100-row batches, 100k rows leave 232 commits / 23,200 rows after the
last checkpoint. Previously `applyFrames` read each four-byte header and each
payload separately: roughly 46,400 asynchronous reads before an ordinary
point lookup could return. This is separate from building the `lookup`
secondary index, which occurs when the first indexed filter runs.

The patch buffers each committed frame range in chunks of up to 1 MiB for
normal frames (up to the existing maximum frame size for an exceptional large
frame). It handles partial reads, headers and UTF-8 payloads across boundaries,
and keeps the existing length validation. Footer selection, checksums, replay
order, trailing-data truncation, mutation publication and fsync are unchanged.

| Isolated 100k case         | Cold page before ms | After ms | Capture before / after s | Whole-run RSS before / after MiB |
| -------------------------- | ------------------: | -------: | -----------------------: | -------------------------------: |
| Narrow LRU parallel, run 1 |               530.4 |     67.5 |              4.43 / 5.19 |                    346.8 / 336.9 |
| Narrow LRU parallel, run 2 |               447.7 |     75.6 |              5.14 / 4.95 |                    338.7 / 350.7 |
| Narrow LRU serial IDs      |               435.3 |     62.0 |              4.89 / 5.16 |                    341.2 / 338.3 |
| Narrow disabled cache      |               437.6 |     67.9 |              4.86 / 4.98 |                    308.8 / 305.5 |
| Wide LRU parallel          |               497.0 |    103.9 |              5.60 / 5.72 |                    248.6 / 237.3 |

Every ordinary page contains 100 rows and bypasses previews. Paired raw files
are in [checkpoint-2](checkpoint-2/). Capture is unchanged code and varies
between runs; this patch makes no ingestion or RSS improvement claim.
The isolated cold indexed view takes 693–713 ms after the fix with LRU; the
following unindexed view takes 168–188 ms. All narrow 100k measurements remain
under the initial process targets, but the modified engine was not installed
into the consumer or re-benchmarked inside Electron.

This is **faster replay, not genuinely lazy recovery**. Initialization still
decodes every tail row to recover locators, including wide payloads. Point
reads use only their needed checkpoint shards, but concurrent requests for
the same uncached shard lack in-flight deduplication. A public multi-ID fetch
could share a file handle and restore caller order; using `$in` today is not a
safe optimization because it does not use the scalar `_id` fast path.
The serial-ID experiment alone did not eliminate the cold delay.

## Filtering and sorting

`QueryService.filter` calls `candidateData` before applying filter, sort,
offset and limit. For an unindexed condition it loads **all records**, not
just matches. The cached adapter clones that full array when caching is
enabled. For indexed conditions the secondary index builds from a scan on
first use, retains field values/buckets/order, and materializes all candidate
documents before filtering and sorting. `limit: 100` does not bound this work.

The persistence adapter has `iterateRecords`, but the collection public API
does not expose a cursor. Reaching through `collection.container` would not
be an appropriate consumer fix. Even that internal iterator first
materializes and sorts the full locator index: streaming documents alone
would not provide a total-memory bound.

dbcurious additionally asks for up to 100k sorted matches and then keeps only
their positions. That avoids sending all rows to the renderer but does not
avoid their initial materialization. Its 32 MiB source-payload limit is a
reasonable conservative operation guard, not a guarantee on JS heap size.
The current one-view positions cache is O(matches), not O(page size).

## Recovery and atomicity

For this filesystem adapter, one bounded collection mutation appends frames,
a footer and a trailer and syncs the file before acknowledging it. Recovery
selects a valid committed trailer and removes an incomplete following tail.
A collection queue is not a transaction across collections, and the public
API has no database transaction encompassing result rows, query metadata
and preview. The static queues only coordinate handles within one process;
these experiments do not establish cross-process writer isolation.

The application's high-water row count is still necessary for its chosen
layout: rows can commit successfully and the process can die before metadata
advances. Recovery then exposes the previous acknowledged prefix and hides
the complete but unpublished trailing batch. Preview slicing follows the same
count. For immutable captures with retry-as-new-result, this is sufficient
for the documented conservative recovery contract. It does not preserve
every engine-committed row as application-visible, and it is not resumability.
Do not remove this mechanism based on single-collection atomicity.

Cross-collection atomic row-plus-metadata publication would help if exact
batch publication, resumability, or stronger concurrent reads become product
requirements. That would require a durable coordinator/WAL and clearly
defined error/acknowledgment outcomes; sequentially awaiting two writes is
not enough. Moving a per-result commit marker into the row collection is a
smaller alternative only with a public mixed-mutation transaction API and an
explicit application schema migration. The present `insertMany` cannot
atomically update the existing metadata record in another collection.

## Prioritized follow-ups and regression gates

| Priority               | Fix                                                                                                                                                                                         | Required regression evidence                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0, implemented        | Buffered replay, retain format 3 and existing commit protocol                                                                                                                               | Cold ordinary page <250 ms at 100k narrow/wide; boundary/short-read handling, updates/deletes/order, populated checkpoint plus tail, torn recovery, exact values and both reader versions                                                                                               |
| P0, next               | Construct and write locator checkpoints one shard at a time; avoid full Map/grouped-array/output copies; bound locator cache independently; deduplicate in-flight shard loads               | 100k capture <30 s and peak process RSS <512 MiB; exploratory 1m reports checkpoint peaks, heap/external/RSS and disk. Test duplicate IDs, update/delete overlay precedence, short writes, failed checkpoint/footer/fsync, recovery with old readers, no partially published checkpoint |
| P1                     | Correct obsolete-checkpoint reclaimable accounting and measure compaction working set before enabling more compaction                                                                       | Disk growth and reclaimability across repeated checkpoints; no loss after interrupted compaction; snapshot readers keep valid locations; compaction peak RSS also measured                                                                                                              |
| P1                     | Public cancellable async cursor with filter/projection and explicit snapshot semantics; stream count without retaining documents                                                            | Exact output versus existing API across adapters, zero/offset/limit behavior, early break/error closes handles, mutation/compaction interleaving, no full record-array allocation on selective/unindexed scans                                                                          |
| P1                     | Bounded top-K for finite sorted pages; external merge sort for full ordered exports                                                                                                         | Comparator equivalence, stable capture-order ties, NULL last both directions, exact large integers/decimals/special numerics, UTF-8 order; bounded bytes, spill cleanup, cancellation, disk-full recovery, limited merge fan-in                                                         |
| P1                     | Genuinely lazy tail locators / persistent ordered access and a public multi-ID page API                                                                                                     | Cold first/second/random page and selective filter measured separately, I/O counts independent of total row payload, shared shard loads, stable page membership across mutation; no hidden full-index build                                                                             |
| P2                     | Consumer integration: retain only projected sort keys/ordinals when API exists; release capture handles before cold benchmarks; evaluate metadata-write and disk-check frequency separately | Original real-PG benchmark, independent exact comparator tests, 1 MiB IPC pages, lossless CSV, crash recovery and low disk. Never batch past durability boundaries or weaken safety checks merely for throughput                                                                        |
| P2, requirement-driven | Atomic updates spanning rows and commit metadata                                                                                                                                            | Process kills before/after each durable boundary, uncertain fsync outcomes, restart all-or-none visibility, replay idempotency, old-reader rejection where needed; retain existing high-water contract until adopted                                                                    |

A top-K heap uses O(offset + limit) entries, but wide keys/documents require
an explicit byte budget too. Unsorted finite pages can stream and retain
only the page while continuing to count matches. Full sorted exports need
bounded runs and a bounded fan-in merge, not top-K. Spill files must preserve
exact source strings, NULL/empty distinctions and the original ordinal as
the final stable tie breaker. Do not substitute JS `Number` for exact numeric
ordering. No throughput or memory improvement is claimed for these unbuilt
follow-ups; use the raw baseline cases here as their before measurements.

## Compatibility and validation

The patch changes reads only, with no new format, flags or files. The measured
CamaDB checkout starts at `8191959`; it is not identical to the pinned alpha.
Existing differences include legacy-storage handling and exports. The tested
normal format-3 segment algorithm differs by buffered replay and legacy error
wording; this work does not authorize replacing the alpha with the entire
checkout or changing legacy migration policy. Backport the focused fix into
the release line and retain populated-store compatibility checks.

Any future persistent locator/transaction format change must first specify
a new version, old-reader behavior, backup and restore requirements, an
explicit copy/migration path, crash-safe publication and a rollback policy.
Shard-by-shard checkpoint writing may preserve the existing descriptor format
and footer-last publication, but still needs the failure tests above. Simply
moving allocations to temporary files is not proof of safe publication.

The PR applies the focused patch to `develop` at `d393b00`. The core build,
ESLint and all 32 core suites were rerun there: **421 tests passed**. The
measurements below retain their original tested baseline.

Validation completed during the investigation:

- Core TypeScript build and ESLint on changed engine/test files.
- All 32 core test suites: **419 tests passed**, including 169 filesystem and
  persistence-adapter conformance tests.
- Added replay regressions for multibyte wide frames crossing chunks,
  a split four-byte frame header, injected short reads, and checkpoint-plus-tail recovery after a
  torn following batch. Existing updates, deletes and compaction tests pass.
- [Public-API compatibility check](../../scripts/checkpoint-2/compatibility.mjs):
  alpha writer/current reader and reverse, populated checkpoint, exact values,
  delete, committed tail, torn tail and subsequent write/reopen all pass.
- Consumer's existing offline ordering, library, CSV, preview, persistence and
  SIGKILL tests: **8 passed** against its unchanged pinned package. The SIGKILL
  test kills after row commit but before count advancement; it is not a test
  of every possible mid-write crash boundary or power loss.

## Commands

Run from the respective repositories. Scripts use public package exports;
no consumer imports of engine internals are needed. Output directories must
exist. Every harness store is temporary and removed on completion.

```sh
# Consumer: unchanged original workload, including exploratory million cases.
cd /Users/elmarti/Projects/dbcurious
node tooling/postgres.mjs up
node --max-old-space-size=512 tooling/benchmarks/snapshots.mjs /Users/elmarti/Projects/BuddyCode/camadb/docs/benchmarks/checkpoint-2/consumer-reproduction.json

# Engine: build candidate, then separate-process public-API comparisons.
cd /Users/elmarti/Projects/BuddyCode/camadb
node_modules/.bin/tsc --build packages/core --pretty false
node scripts/checkpoint-2/compare.mjs /Users/elmarti/Projects/dbcurious /Users/elmarti/Projects/BuddyCode/camadb docs/benchmarks/checkpoint-2
PROFILE_ALLOCATIONS=1 node --expose-gc --max-old-space-size=512 scripts/checkpoint-2/profile.mjs /Users/elmarti/Projects/dbcurious docs/benchmarks/checkpoint-2/allocations-million-lru.json 1000000 narrow lru parallel
node --expose-gc --max-old-space-size=512 scripts/checkpoint-2/profile.mjs /Users/elmarti/Projects/dbcurious docs/benchmarks/checkpoint-2/baseline-million-disabled.json 1000000 narrow disabled parallel
node scripts/checkpoint-2/compatibility.mjs /Users/elmarti/Projects/dbcurious /Users/elmarti/Projects/BuddyCode/camadb
node_modules/.bin/jest --config jest.config.js packages/core/src --runInBand
```
