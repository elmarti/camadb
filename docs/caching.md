# Configurable record caching

Caching is optional and **disabled by default**. Configure it per database; each collection handle owns a separate cache and budget:

```ts
const db = new Cama({
  persistenceAdapter: PersistenceAdapterEnum.FS,
  path: './data',
  cache: { mode: 'lru', maxBytes: 8 * 1024 * 1024, maxRecords: 1000 },
});
const collection = await db.initCollection('notes', { columns: [], indexes: [] });
const stats = collection.cacheStats();
collection.clearCache();
```

## Modes and limits

| Mode       | Admission                                                                                        | When full                                       |
| ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `disabled` | None; reads go directly to storage                                                               | No retained records                             |
| `eager`    | Warm in storage order during `initCollection`; refresh on the next point read after invalidation | Stop admission; overflow reads bypass the cache |
| `lazy`     | Admit records requested by identity reads                                                        | Stop admission; overflow reads bypass the cache |
| `lru`      | Admit records requested by identity reads                                                        | Evict least-recently-used records               |

Every enabled mode defaults to **8 MiB and 1,000 records**. Both limits apply, must be nonnegative safe integers, and may be zero to retain nothing. A record larger than the byte budget bypasses admission without evicting other records. Direct `new Collection(...)` callers can explicitly await `initializeCache()` for eager warming; `Cama.initCollection()` does this automatically.

`bytes` counts the UTF-8 JSON encoding of retained records plus their IDs. It is **not a JavaScript heap limit**: object/map overhead, temporary serialization/cloning buffers, revision metadata, adapter pages, query results, and application-held references are outside this budget. `maxRecords` additionally bounds cache entry count. Multiply budgets by the number of open collection handles when planning memory. Only JSON-shaped records are admitted; structured-cloneable values such as Dates, Maps, binary objects, or cyclic graphs bypass admission because their JSON size does not faithfully represent their contents. Enabled caches return defensive structured clones and require structured-cloneable documents.

The cache accelerates string `_id` lookups (including identity-only queries). Whole-collection scans and aggregations continue to use storage; their result arrays are not retained in a second cache. Query limits currently apply after scanning, so they do **not** bound scan memory. Eager mode intentionally scans to warm records; filesystem iteration retains collection locator metadata, and current IndexedDB iteration materializes the collection before yielding. Eager mode is therefore unsuitable for a strict total-memory budget. Use disabled/lazy/LRU modes and identity reads for larger collections; this feature does not remove the remaining adapter/query working-set limits.

## Consistency and invalidation

Before consulting cached records, the wrapper checks the adapter's committed revision. Another handle's completed write therefore invalidates cached values, including after deletion and recreation. New stores include an incarnation token so a recreated store cannot reuse an old revision. Older format-v3 stores remain readable without a rewrite on detection. Revision checking still performs metadata I/O; filesystem metadata is fixed-fanout, while localStorage's existing manifest scales with collection size. Caching is not a cross-process writer lock or a multi-operation transaction.

Insert, update, delete, replacement, explicit compaction, and destruction clear the handle's cache. Failed writes clear it too, without poisoning subsequent operations. Automatic compaction follows a mutation, so the mutation invalidation covers it. Maintenance through another handle need not evict unchanged logical records. Reads overlapping a commit cannot populate the cache with the old snapshot. Mixed cached/missing batch reads fall back to storage if their revision changes during loading. `clearCache()` also prevents in-flight reads from repopulating entries from before the clear.

Invalidation is deliberately whole-cache rather than per-ID in this first implementation. Write-heavy workloads may see little benefit. After clearing an eager cache, the next identity read warms it again; lazy/LRU modes refill on demand. No background workers, timers, or unbounded mutation logs are retained.

## Observability

`cacheStats()` returns a copy containing `mode`, `maxBytes`, `maxRecords`, `bytes`, `records`, `hits`, `misses`, `evictions`, `skipped`, and `invalidations`. Counters are cumulative for the handle and are not reset by `clearCache()`. Hits/misses count requested identities, not whole-query results; disabled mode does not count cache lookups. Missing identities are not negatively cached. Statistics do not perform an I/O refresh: entries made stale by another handle remain counted until the next identity read validates the revision or the caller clears the cache.

The shared persistence and collection CRUD suites run across all four adapters and all four cache modes. Final before/after workload measurements and supported-size guidance remain part of #11; no cache speedup is claimed without those measurements.
