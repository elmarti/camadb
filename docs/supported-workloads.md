# Supported runtimes and workloads

## Runtime matrix

| Environment           | Supported integration                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Node.js 22, 24 and 26 | Filesystem and in-memory adapters; CommonJS, ESM and TypeScript                |
| Modern browsers       | IndexedDB, localStorage and in-memory adapters through a browser bundle        |
| Electron main process | Node.js filesystem or in-memory adapters                                       |
| Electron renderer     | Browser-compatible adapters; do not bundle filesystem access into the renderer |

CI validates clean package consumers on every supported Node.js line and drives
the production knowledge demo through real Chrome and native IndexedDB. Browser
correctness does not establish the same throughput or capacity on every device.

## Measured envelope

CamaDB retains raw samples and environment metadata rather than advertising a
universal capacity number:

- storage mutation and cache comparisons cover 100–10,000 small records;
- metadata, full-text, vector and hybrid workloads cover up to 100,000 records
  in the committed development evidence;
- the CI regression gate uses smaller deterministic matrices so pull requests
  finish predictably;
- a record or atomic filesystem/IndexedDB mutation page is limited to roughly
  1 MiB, and one atomic mutation accepts at most 10,000 records.

These are tested points, not an SLA. Payload size, query selectivity, index
shape, disk, browser quota and application concurrency materially affect the
result. Reproduce the matching command with production-shaped documents before
choosing a deployment limit.

## Known working-set limits

String `_id` operations use direct record paths. Broader queries and mutations
can still scan or materialize a collection, and returning all matches allocates
the result set. Cache budgets constrain retained cache entries, not query
results, adapter metadata, JavaScript heap or application references.

Filesystem compaction needs room for the current and replacement generations.
IndexedDB storage and reclamation remain subject to browser quota policy.
localStorage is best reserved for small collections because its manifest and
browser quota are collection-wide constraints.

## Choose another database when

Use SQLite or another mature embedded engine when the application needs SQL,
joins, sophisticated query planning, strict large-dataset memory guarantees, or
well-characterized high-write throughput. Use a client/server database when
many independent processes or users must write shared data concurrently.

CamaDB is a strong fit when TypeScript-native documents, local ownership,
portable browser/Node APIs, inspectable retrieval and simple embedding matter
more than relational planning or multi-writer coordination.

See the [benchmark index](./benchmarks/README.md) and
[Wave 4 interpretation](./benchmarks/wave4-comparison.md) for methodology, raw
reports, regressions and rejected experiments.
