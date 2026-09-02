# Record-oriented storage format

- Status: Accepted for #83
- Scope: CamaDB 3 storage adapters
- Baseline: measured by #11 before implementation

## Context

The compatibility adapters currently serialize a collection as one payload. A point mutation therefore hydrates and rewrites the complete collection, while the adapter cache makes memory usage proportional to collection size. Search and indexing features would amplify that cost, so CamaDB needs a bounded storage model before adding them.

## Decision

CamaDB 3 will use immutable, bounded pages of records plus a small atomically replaced manifest. The adapter contract will expose record and page operations; collection-level filtering remains above that boundary and consumes records incrementally.

### Identity and layout

The document `_id` is the stable logical record identity. A small root manifest selects copy-on-write locator shards; a stable hash chooses the shard containing the `_id` to physical page, generation, and slot mapping. Pages are limited to 512 records and 1 MiB. A record larger than one page fails before publication.

### Atomic commit boundary

A mutation batch is the public atomic boundary. Writers create immutable replacement pages, persist them, and then atomically publish a new manifest generation. Readers use either the previous or new generation and never a mixture. Filesystem adapters use adjacent temporary files, file and directory sync, and rename. IndexedDB publishes pages and the manifest in one bounded read-write transaction. Orphaned unpublished pages are safe to reclaim.

### Index hooks

Each committed batch emits an internal change set containing inserted, replaced, and deleted record identities plus old/new values when available. Future metadata indexes consume the change set in the same commit boundary. The storage format does not embed a particular query or search index.

### Deletion and compaction

Deletes append tombstones to the active generation; they do not rewrite unaffected pages. Compaction copies live records into new pages and publishes them as a new generation. It is resumable, copy-on-write, and safe to abandon before manifest publication. Old pages and tombstones are reclaimed only after the replacement generation is durable and no reader holds it.

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
