# `@camadb/sync`

Optional, transport-independent synchronization foundations for CamaDB.

The version 1 protocol uses stable replica identities, monotonic mutation sequences, parent revisions, durable delete tombstones, idempotent replay, and explicit conflict results. Synchronization can be unavailable indefinitely without preventing local reads or writes.

```ts
import { LocalSyncReplica, synchronize } from '@camadb/sync';

type Note = { _id: string; text: string };
const laptop = new LocalSyncReplica<Note>('laptop');
const desktop = new LocalSyncReplica<Note>('desktop');

laptop.put('notes', { _id: 'one', text: 'written offline' });
const result = await synchronize(laptop, desktop, { batchSize: 100 });
```

`LocalSyncReplica` is the in-memory reference implementation. It establishes protocol behavior and is not a durable remote synchronization service. Persistent replica stores, peer acknowledgement and retention, authentication, encryption, and network transports are follow-up work.
