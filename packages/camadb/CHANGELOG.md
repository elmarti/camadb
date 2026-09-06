# camadb

## 3.0.0-rc.0

### Major Changes

- da19fe7: Introduce the breaking CamaDB 3 typed collection API, carrying document types through inserts, filters, updates, aggregation, and results.

### Minor Changes

- 9221cfe: Automatically reclaim obsolete record storage at configurable byte/ratio thresholds. Expose collection.compact() and collection.storageStats(), preserve active readers during cleanup, and report maintenance failures without rejecting committed writes.
- 5d798d6: Add disabled, eager, lazy, and bounded LRU record caching with configurable per-handle byte and record budgets, observable statistics, explicit clearing, revision-aware invalidation, and shared adapter/CRUD conformance coverage.
- 0375472: Add typed, bounded exact vector search with cosine, dot-product, and Euclidean scoring, configured dimensions, top-k results, and metadata pre-filtering.
- c9ca553: Add typed hybrid keyword and vector retrieval with configurable reciprocal-rank fusion and inspectable component ranks, scores, contributions, and final scores.
- 1a999c5: Add bounded record-oriented persistence with atomic manifest publication, direct identity operations, tombstones, and recoverable compaction.
- a6f3520: Add typed delete, count, and upsert operations, immutable generated document identities, duplicate-ID enforcement, and acknowledged mutation-result contracts.
- d551555: Add a versioned collection-storage envelope and read-only detection of published 2.x storage. CamaDB 3 refuses legacy stores with an actionable error instead of silently converting or reinterpreting them.

### Patch Changes

- 0b468c3: Restructure CamaDB as a workspace with explicit package boundaries, preserve the legacy `camadb` entry point, introduce the AI memory and embedding provenance package, and publish verified CommonJS, ESM-import, TypeScript, and browser entry points for Node.js 22 and newer.
- d546e87: Preserve sibling IndexedDB collections when deleting and recreating a collection, close stale managed connections during cross-tab upgrades, report blocked schema changes without hanging, and retain clear errors when a destroyed collection instance is reused.
- 5bb11ce: Keep localStorage-backed collections consistent after replacing their complete dataset so subsequent reads return the updated rows instead of stale cached data.
- 103838d: Make filesystem collection mutations atomic and durable, including interrupted-write cleanup and recovery.
- Updated dependencies [9221cfe]
- Updated dependencies [0b468c3]
- Updated dependencies [55ed706]
- Updated dependencies [5d798d6]
- Updated dependencies [0375472]
- Updated dependencies [c9ca553]
- Updated dependencies [d546e87]
- Updated dependencies [5bb11ce]
- Updated dependencies [1a999c5]
- Updated dependencies [103838d]
- Updated dependencies [da19fe7]
- Updated dependencies [a6f3520]
- Updated dependencies [d551555]
  - @camadb/core@3.0.0-rc.0
