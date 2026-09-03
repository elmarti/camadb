# Record-oriented storage format

- Status: Accepted for #83
- Scope: CamaDB 3 storage adapters
- Baseline: measured by #11 before implementation

## Context

The compatibility adapters currently serialize a collection as one payload. A point mutation therefore hydrates and rewrites the complete collection, while the adapter cache makes memory usage proportional to collection size. Search and indexing features would amplify that cost, so CamaDB needs a bounded storage model before adding them.

## Decision

CamaDB 3 adapters expose bounded record operations; collection-level filtering
remains above that boundary and consumes records incrementally. Browser adapters
use their native bounded records/transactions. The filesystem layout uses the
append-segment amendment below.

### Identity and layout

The document `_id` is the stable logical record identity. Physical lookup is
runtime-specific, but uses a stable hash where a sharded locator is required.
Mutation batches are limited to 10,000 records and an individual record to 1
MiB. Browser layouts may group records into pages of at most 512 records.

### Atomic commit boundary

A mutation batch is the public atomic boundary. Readers use either the previous
or new generation and never a mixture. IndexedDB publishes records and metadata
in one bounded read-write transaction. localStorage publishes generation-keyed
values before its manifest. The filesystem commit protocol is specified in the
amendment below.

### Index hooks

Each committed batch emits an internal change set containing inserted, replaced, and deleted record identities plus old/new values when available. Future metadata indexes consume the change set in the same commit boundary. The storage format does not embed a particular query or search index.

### Deletion and compaction

Deletes leave recoverable obsolete data or tombstones; they do not rewrite
unaffected records. Compaction copies live records into a new physical
generation. It is copy-on-write and safe to abandon before publication. Old
storage is reclaimed only after the replacement is durable and no reader holds
it.

### Streaming and bulk bounds

Adapters expose async record/page iteration. Pages are bounded to 512 records and 1 MiB, and atomic mutation batches are bounded to 10,000 records. Larger imports must submit explicit batches and can apply backpressure between them. Operations over the limit fail before publication rather than silently weakening atomicity.

### Browser transaction limits

IndexedDB work is split into bounded transactions selected by measured record and byte budgets. A single public mutation batch must fit one publication transaction; larger imports use an explicit multi-batch streaming API and report progress. Transactions do not remain open across application callbacks or unrelated event-loop work.

### Versioning and legacy storage

The manifest carries a CamaDB storage-format discriminator and version independent of the npm package version. Record-oriented storage begins at format version 3. Existing 2.x payloads are handled through the detection and explicit export/migration APIs introduced by #75. Opening a legacy payload never silently reinterprets, upgrades, or mutates it. Migration writes a separate version-3 generation, validates it, and only then allows an explicit caller-approved switch; reruns are idempotent and recoverable.

## Consequences

- Point reads and mutations touch a bounded number of pages plus the manifest.
- Space is temporarily amplified during mutation and compaction in exchange for crash safety.
- Atomicity is defined per bounded batch, not for an unbounded import.
- Adapters need common recovery, compaction, and change-set conformance tests.
- Benchmark workloads from #11 remain unchanged and become the acceptance comparison for #83 and #53.

## Filesystem amendment: checksummed append segment

The initial immutable-page filesystem implementation met the bounded-I/O goal,
but the unchanged benchmark exposed a durability fan-out problem: a 10,000-row
insert published and synced roughly 280 files. It measured 701–712 ms, more than
20 times slower than the retained whole-collection baseline. That implementation
is therefore superseded for filesystem persistence, while IndexedDB and
localStorage retain their runtime-specific layouts.

The filesystem stores mutation frames, an optional internally sharded locator
checkpoint, commit metadata, and a fixed checksummed trailer in one sequential
segment. A mutation batch is appended and synced once. Readers only accept a
transaction whose trailer and referenced metadata validate; a torn or corrupt
tail is truncated back to the last valid trailer. Point lookup reads the footer,
one locator region, and one record frame. Scans use bounded chunks rather than
opening the file for every row or hydrating it in one read.

Large batches create locator checkpoints. Smaller committed tails are replayed
over the checkpoint on open, with periodic checkpoints bounding replay work.
Compaction writes a complete replacement segment, syncs it, atomically renames
it, and syncs the containing directory. The previous inode remains available to
already-open snapshot readers; physical replacement is deferred while a reader
is pinned on platforms where that guarantee cannot be maintained.

This amendment was selected only after reversed-order benchmarks cleared both
the current record-page adapter and the historical whole-collection bulk gate.
The prototype measured a 10,000-row bulk insert at 30.4 ms, point operations at
0.34–4.2 ms, and mixed scans at 6.2–7.5 ms. The raw samples and rejected
intermediate layouts remain under `docs/benchmarks/speed-lab`.

The segment is format version 3, not a reinterpretation of a 2.x payload.
Detection remains non-mutating. Any conversion is an explicit migration that
writes and validates separate version-3 storage before caller-approved use.
