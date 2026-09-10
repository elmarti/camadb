# Synchronization foundations

`@camadb/sync` provides a transport-independent protocol and an in-memory reference replica. It does not automatically synchronize `Cama` collections or persist queues. Your application supplies the durable replica store, transport, authentication and acknowledgement/retention policy.

## Offline edits and one-way replay

```ts
import { LocalSyncReplica, synchronize } from '@camadb/sync';

type Note = { _id: string; text: string };
const laptop = new LocalSyncReplica<Note>('laptop');
const desktop = new LocalSyncReplica<Note>('desktop');

laptop.put('notes', { _id: 'one', text: 'Written offline' });
const first = await synchronize(laptop, desktop, { batchSize: 100 });
console.log(first.applied, desktop.get('notes', 'one'));

laptop.put('notes', { _id: 'two', text: 'Another local edit' });
const next = await synchronize(laptop, desktop, { cursor: first.cursor });
console.log(next.cursor);
```

`synchronize(source, target)` is directional. A cursor belongs to that source's mutation log and the relevant target progress; persist it together with applied target state in a production implementation. Replaying an already applied mutation is idempotent. The reference replica's records, log and cursors are lost when the process ends.

## Conflicts are data

```ts
laptop.put('notes', { _id: 'one', text: 'Laptop edit' });
desktop.put('notes', { _id: 'one', text: 'Desktop edit' });
const replay = await synchronize(laptop, desktop, { cursor: next.cursor });
console.log(replay.conflicts, desktop.conflicts());
```

Concurrent branches do not silently overwrite each other. Inspect the incoming mutation, local state and revisions and define your application's resolution policy. Deletes carry tombstones so an old put cannot simply resurrect a deleted record. The protocol does not define a complete user-facing merge workflow.

## Resume an interruption

```ts
import { SyncInterruptedError } from '@camadb/sync';

try {
  await synchronize(laptop, desktop, { cursor: next.cursor });
} catch (error) {
  if (error instanceof SyncInterruptedError) {
    console.log('Resume cursor:', error.cursor, 'Partial result:', error.partial);
  } else {
    throw error;
  }
}
```

A failure during apply reports acknowledged progress; retry from that cursor against the same source log. See the [protocol design](decisions/0004-synchronization-protocol.md) and API reference for mutation validation and revision semantics.
