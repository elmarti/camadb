# @camadb/core

The database, collection/query model, built-in compatibility adapters, and shared public types for CamaDB.

The package retains the familiar adapter selector for filesystem, IndexedDB, localStorage and in-memory storage. New adapters must depend only on this package's public contracts. CamaDB 3 does not open or convert persisted CamaDB 2 stores; see the [compatibility policy](../../docs/migration-2.x.md).

## Runtime and module support

CamaDB supports maintained Node.js releases from Node.js 22 onward. The package publishes CommonJS for compatibility and exposes that entry point explicitly to both `require()` and ESM `import`. Browser bundling is supported for non-filesystem adapters; Electron main processes use the Node.js path and renderer processes use the browser path.

See the [CamaDB 3 API guide](../../docs/api.md) and [supported workload guidance](../../docs/supported-workloads.md).

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

### Read-only collection catalogue

`await db.listCollections({ limit: 100, after })` returns `{ collections, nextCursor? }`, ordered by collection name. Pass the returned cursor as `after` for the next page. `await db.describeCollection(name)` returns `{ name, columns, indexes }` or `undefined`; `await db.collectionExists(name)` returns a boolean. Columns are declared metadata, not inferred document types. Malformed metadata raises an error rather than appearing absent.

The public methods select an adapter-level `ICollectionCatalogue` capability without constructing a collection persistence adapter. FS and IndexedDB currently implement this capability. LocalStorage and InMemory reject with an explicit unsupported-adapter error; they do not return a misleading empty catalogue. InMemory currently has collection-instance storage rather than a shared database registry.

Catalogue reads never initialize a collection, read document payloads or migrate storage. Collection names and metadata shapes are validated consistently across supported adapters. Pages contain at most 100 descriptors and discovery inspects at most 10,000 directory entries or object stores. Metadata is limited to 256 KiB. Missing metadata denotes an absent collection; unrelated IndexedDB stores without CamaDB collection metadata are skipped. Only declared columns and ordinary index names are returned, not search/vector index definitions.

FS inspection leaves a missing database directory absent, rejects symbolic-link entries and bounds reads before parsing. Inspect a closed database for a consistent view; these checks are not a security boundary against a process concurrently replacing files.

IndexedDB inspection opens the current database version without requesting an upgrade. If opening would create a missing database, it aborts the initial upgrade transaction and returns absence without persisting a database or version change. This avoids relying on `indexedDB.databases()` enumeration and its deletion races. It reads only the `collection-metadata` key in readonly transactions, closes its connections and yields on version changes. The 256 KiB limit is checked after IndexedDB structured-clones the metadata; it is not a bound on the browser's initial read allocation. Transaction/open failures remain errors, not absence. See the [IndexedDB upgrade and abort semantics](https://www.w3.org/TR/IndexedDB/).

Catalogue pages are not a snapshot across concurrent writers or multiple calls. Await `initCollection` and pending collection operations before inspecting. Initialization waits for metadata readiness in every cache mode, so a newly created empty collection is immediately discoverable.

Validation includes shared FS/IndexedDB conformance tests for missing storage, pagination, metadata, reopen, malformed input and limits. IndexedDB-specific tests cover unchanged versions/object stores/payloads and releasing connections before later schema upgrades. Real-browser checks also verify missing-database non-persistence and metadata-only catalogue operations.

Collection creation (including `new Collection`) rejects empty names, dot/parent names, path separators, NULs and names over 255 characters before constructing adapters. Metadata creation and updates share the catalogue limits: up to 1,000 columns/index names, column/index names up to 255 characters, type labels up to 100 characters, and up to 256 KiB of UTF-8 JSON formatted with two-space indentation. That serialization bound keeps filesystem and IndexedDB metadata within the same inspectable envelope.

Reopening metadata outside these bounds rejects without rewriting it. Such pre-existing stores need an explicit application-level export/re-import into a new location with valid metadata; do not silently truncate names or rewrite a live store. Catalogue pages remain non-transactional across concurrent writes. Name checks do not provide isolation from another process replacing filesystem paths or symlinks.
