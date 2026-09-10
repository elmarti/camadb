# Operations and troubleshooting

## Establish ownership

Use one application owner for a filesystem location. Per-instance write queues are not cross-process locks; opening the same location in independent writers is outside the supported model. Keep Electron filesystem work in the main process. Browser storage is origin/profile scoped and subject to browser quota and eviction behavior.

Await outstanding operations before stopping your application. There is no public `close()` method. **`destroy()` deletes a collection**, and later operations on that handle fail. Obtain a new initialized handle if intentionally recreating the collection.

## Diagnose common failures

| Symptom                           | Check and next step                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A v2 store refuses to open        | Leave the old location intact; export with compatible v2 code and import into a new v3 location.                                                                              |
| Invalid collection metadata/name  | Names must be a single valid component. Check the [catalogue contract](../packages/core/README.md#read-only-collection-catalogue), including metadata size and field lengths. |
| Browser store appears empty       | Check origin, profile, adapter and configured database name.                                                                                                                  |
| Duplicate identity                | Decide whether the import should insert, update or upsert; do not blindly retry a committed batch.                                                                            |
| Quota/disk failure                | Check free space and browser quota. Compaction needs room for replacement storage. Preserve the last committed state before retrying.                                         |
| High memory despite an LRU budget | The record cache budget excludes indexes, adapter metadata, sort/aggregation work and returned arrays. Reduce payloads/batches and measure the query.                         |
| Unexpected semantic results       | Verify embedding provenance and metric; equal dimensions do not guarantee a shared embedding space.                                                                           |
| Catalogue method rejects          | Read-only catalogues currently support filesystem and IndexedDB, not every adapter.                                                                                           |

## Inspect and compact

```ts
const stats = await collection.storageStats();
console.log(stats.totalBytes, stats.reclaimableBytes, stats.lastCompactionError);
await collection.compact();
```

This snippet uses an already initialized collection. Browser byte statistics are logical estimates, not browser quota or OS space accounting. Automatic maintenance failures are exposed via `lastCompactionError` without turning an already committed write into a rejected write. Explicit compaction errors reject normally. Read [storage](storage.md) for thresholds and recovery behavior.

## Back up deliberately

CamaDB does not ship a general backup/restore service. For logical exports, read application documents in bounded pages while writes are paused, serialize their types deliberately (including dates), and import into a fresh location. Do not treat a sequence of pages during active mutation as a transactional snapshot. For filesystem copies, quiesce the owner and copy the complete store, not selected segment files during a write.

Memory stores provide `memory.export()` for their versioned logical export, but application-managed backup storage, import policy and encryption remain your responsibility. Verify a restore before relying on any backup. Do not keep the only copy in the same browser profile or device.

## Report a reproducible problem

Include package version, Node/browser version, adapter, cache mode, record size/count, query shape, expected result and actual error. Reduce the problem to synthetic data. Benchmark reports should include cold and warm runs, environment metadata and output sizes; see [benchmark methodology](benchmarks/README.md).
