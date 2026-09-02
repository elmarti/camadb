# Record-oriented storage

CamaDB 3 stores records independently so identity-based reads and mutations do not load or rewrite a complete collection.

## Durability model

The filesystem adapter writes immutable data pages and copy-on-write locator shards. A small root manifest selects one generation; replacing that manifest is the atomic commit boundary. An interrupted write can leave unreachable pages or shards, but readers continue using the last published generation. Compaction publishes a clean generation before reclaiming unreachable files.

IndexedDB uses one native key per record. A bounded mutation and its generation metadata commit in one read-write transaction. localStorage uses generation-keyed values and publishes metadata last. Deleted identities remain tombstones until compaction where the runtime requires them for recovery.

## Declared bounds

- Maximum page size: 1 MiB
- Maximum records per filesystem page: 512
- Maximum records in one atomic mutation: 10,000

A record larger than one page or an atomic mutation over the limit fails before publication. Applications importing larger datasets must submit explicit batches of at most 10,000 records and await each batch to apply backpressure. A multi-batch import is intentionally not advertised as one atomic transaction.

Queries that contain only a string `_id` use direct record lookup. Queries over other fields still scan records until metadata indexes provide a narrower query plan. Returning every matching document necessarily allocates the result set; use query limits and application-level batches for large scans.

## Format compatibility

Record storage uses format version 3. When an adapter finds a non-empty collection payload without a record manifest, it reports that explicit migration is required. It never rewrites or reinterprets the payload while opening it. Use the detection/export facilities described in [2.x migration](./migration-2.x.md) before creating the version-3 record store, and retain the source until the migrated collection has been validated.

The detailed format and recovery rationale is recorded in [the storage decision](./decisions/0001-record-oriented-storage.md).

## Automatic reclamation and maintenance

Updates and deletes can leave obsolete pages, values, and tombstones. Automatic compaction runs when reclaimable storage reaches **both 25% of total storage and 16 MiB**. localStorage uses **64 KiB** instead of 16 MiB because its browser quota is much smaller. Thresholds can be overridden:

```ts
const db = new Cama({
  persistenceAdapter: PersistenceAdapterEnum.FS,
  compaction: { minReclaimableBytes: 4 * 1024 * 1024, minReclaimableRatio: 0.25 },
});

const stats = await collection.storageStats();
// liveBytes, reclaimableBytes, totalBytes, tombstones, generation,
// and lastCompactionError if automatic maintenance failed.
await collection.compact(); // explicit maintenance, regardless of thresholds
```

The policy amortizes full statistics scans using conservative retired-byte accounting. A reopened adapter checks accumulated garbage on its next mutation. Below the thresholds, some garbage is deliberately retained; repeated churn above them triggers reclamation rather than indefinite growth.

Maintenance is serialized with writes and can add latency to the mutation that triggers it. It does not take a global read lock: filesystem/localStorage snapshot readers retain their previous values until they finish; reclamation deferred for such readers is retried on a subsequent qualifying mutation or explicit maintenance call. Filesystem compaction copies records in batches of at most 512; locator metadata still scales with the collection. This is not a cross-process filesystem locking protocol.

Filesystem `totalBytes` measures record-store files; live/reclaimable bytes estimate their retained versus obsolete serialized content, excluding legacy payloads and collection metadata. Browser and in-memory statistics are **logical serialized-byte estimates**, not browser quota usage, engine allocation, or process heap size. The browser controls when deleted IndexedDB space is reused or returned to the OS.

Automatic maintenance failures do not turn a committed mutation into a rejected write. Inspect `lastCompactionError` and retry `compact()` after addressing the cause. Explicit maintenance failures reject normally, while the last published generation remains readable. Disk space must accommodate the old and replacement generations during compaction.
