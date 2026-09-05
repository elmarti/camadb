# @camadb/core

The database, collection/query model, built-in compatibility adapters, and shared public types for CamaDB.

The package currently retains the legacy adapter selector so existing `camadb` configurations remain compatible. New adapters must depend only on this package's public contracts; adapter-specific entry points will be extracted in the next compatibility-safe step.

## Runtime and module support

CamaDB supports maintained Node.js releases from Node.js 22 onward. The package publishes CommonJS for compatibility and exposes that entry point explicitly to both `require()` and ESM `import`. Browser bundling is supported for non-filesystem adapters; Electron main processes use the Node.js path and renderer processes use the browser path.

## IndexedDB schema changes

IndexedDB collection creation and deletion require a browser-wide version change. CamaDB closes its managed connection when another tab requests an upgrade. If an unrelated connection remains open and blocks CamaDB's own schema change, the operation rejects with a contextual `BlockedError` instead of waiting indefinitely. Close the other tab or connection and retry the operation.

## Document identity

New documents receive an immutable string `_id` when one is not supplied.
Duplicate identities are rejected, including across overlapping mutations.
Insert, update, upsert, and delete methods return acknowledged mutation results
with the affected IDs or counts.

## Metadata indexes

Collection `indexes` accelerate top-level scalar equality and range predicates,
including intersections. Persistent adapters retain the original definitions;
index contents rebuild from committed records and never replace storage as the
source of truth. Unsupported query shapes safely retain scan behavior. See the
[index guide](../../docs/indexes.md) for supported operators, memory tradeoffs,
and benchmarks.

## Full-text search

Configure top-level string fields with `searchIndexes` and call `searchText` for
deterministic BM25-ranked keyword retrieval. Results expose the typed document,
score, and matched terms; optional metadata filters are applied before scoring
when an index can resolve them. Derived postings rebuild from committed records.
See the [full-text guide](../../docs/full-text-search.md).
