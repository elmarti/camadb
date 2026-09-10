# CamaDB 3 API guide

All public packages provide CommonJS, ESM and TypeScript entry points. Node.js
integrations require Node.js 22 or newer. Browser bundles must select IndexedDB,
localStorage or in-memory persistence; Electron main processes may use the
filesystem adapter.

## Database and collections

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Note {
  _id: string;
  body: string;
  embedding?: readonly number[];
  topic: string;
}

const database = new Cama({
  persistenceAdapter: PersistenceAdapterEnum.FS,
  path: './notes',
  cache: { mode: 'lru', maxBytes: 8 * 1024 * 1024, maxRecords: 1_000 },
});

const notes = await database.initCollection<Note>('notes', {
  columns: [],
  indexes: ['topic'],
  searchIndexes: ['body'],
  vectorIndexes: [{ field: 'embedding', dimensions: 384 }],
});
```

`initCollection` waits for metadata readiness before resolving, including with lazy or disabled record caching. Collection names and metadata are validated before adapter creation; see the [catalogue contract and limits](../packages/core/README.md#read-only-collection-catalogue).

`Collection<T>` carries the document type through its complete public surface:

| Area      | Operations                                                                   |
| --------- | ---------------------------------------------------------------------------- |
| Mutation  | `insertOne`, `insertMany`, `updateMany`, `upsert`, `deleteOne`, `deleteMany` |
| Query     | `findMany`, `count`, `aggregate`                                             |
| Retrieval | `searchText`, `searchVector`, `searchHybrid`                                 |
| Storage   | `compact`, `storageStats`, `destroy`                                         |
| Cache     | `cacheStats`, `clearCache`                                                   |

Inserted documents may omit `_id`; CamaDB generates an immutable string identity
and returns it in the acknowledged mutation result. Duplicate identities reject
without partially applying an insert batch. See the dedicated guides for
[metadata indexes](./indexes.md), [full-text retrieval](./full-text-search.md),
[vectors](./vector-search.md), [hybrid ranking](./hybrid-search.md),
[storage](./storage.md), and [caching](./caching.md).

## Local-first memory

`@camadb/memory` adds `CamaMemory.create()` and `createMemoryStore()`. A memory
store provides `remember`, `rememberMany`, `recall`, `explain`, `inspect`,
`edit`, `list`, `export`, and `forget`. Embedding providers are application
dependencies; CamaDB does not install or call one implicitly. Stored and query
embeddings must carry compatible provenance.

## Synchronization foundation

`@camadb/sync` exports `LocalSyncReplica`, `synchronize`, the versioned mutation
contracts, and `SyncInterruptedError`. The local replica is a reference
implementation for offline queues, idempotent replay and explicit conflicts. It
is not a durable hosted synchronization service.

## Package choice

- Prefer `@camadb/core` for new database integrations.
- Use `camadb` when retaining the historical package name. It re-exports core,
  but does not make the breaking v3 collection or storage formats compatible
  with v2.
- Add `@camadb/memory` or `@camadb/sync` only when those higher-level contracts
  are needed.

The package `.d.ts` files are the authoritative exhaustive type reference. This
guide documents the supported entry points and directs each behavior to its
versioned design and operational documentation.
