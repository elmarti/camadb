# Getting started

## Choose your runtime

| Runtime                      | Adapter                               | Storage location                                                                |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Node.js 22+                  | `PersistenceAdapterEnum.FS`           | A filesystem directory owned by your application                                |
| Electron main process        | `PersistenceAdapterEnum.FS`           | An application-controlled directory such as one under `app.getPath('userData')` |
| Browser or Electron renderer | `PersistenceAdapterEnum.IndexedDb`    | A database name scoped to the browser origin/profile                            |
| Small browser state          | `PersistenceAdapterEnum.LocalStorage` | Origin-scoped synchronous storage with limited quota                            |
| Tests and disposable state   | `PersistenceAdapterEnum.InMemory`     | Process memory; not persistent across restarts                                  |

```sh
npm install @camadb/core@rc
# Optional, only for memory or synchronization:
npm install @camadb/memory@rc @camadb/sync@rc
```

These are v3 release candidates. Check the resolved versions and keep a lockfile. All public packages provide CommonJS, ESM and TypeScript declarations. The historical `camadb` name re-exports core in v3, but its unqualified npm tag may still select v2.

## A complete Node.js example

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Task {
  _id: string;
  title: string;
  done: boolean;
  createdAt: Date;
}

async function main() {
  const database = new Cama({
    path: './tasks-v3',
    persistenceAdapter: PersistenceAdapterEnum.FS,
  });
  const tasks = await database.initCollection<Task>('tasks', {
    columns: [{ title: 'createdAt', type: 'date' }],
    indexes: ['done'],
    searchIndexes: ['title'],
  });
  const inserted = await tasks.insertOne({
    title: 'Read the CamaDB guides',
    done: false,
    createdAt: new Date(),
  });
  console.log(await tasks.findMany({ done: false }, { limit: 10 }));
  await tasks.updateMany({ _id: inserted.insertedId }, { $set: { done: true } });
  console.log(await tasks.count({ done: true }));
}

main().catch(console.error);
```

The type on `initCollection<Task>()` drives subsequent operations. Column declarations tell persistence how to restore values such as dates; they are not a runtime schema validator for every document. `_id` is always an immutable string. Omit it to generate an identity, or provide a stable ID when importing.

## Browser initialization

Use the same collection API after replacing the database configuration:

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

const database = new Cama({
  path: 'my-app-v3',
  persistenceAdapter: PersistenceAdapterEnum.IndexedDb,
});
const notes = await database.initCollection<{ title: string }>('notes', { columns: [], indexes: [] });
await notes.insertOne({ title: 'Available offline' });
```

This snippet belongs in client-side async code. In React/Next.js, initialize on the client and retain the resulting handle rather than recreating it on every render. Browser data belongs to an origin and profile: switching from localhost to production or using another profile does not move that data. Browsers may deny or evict storage; handle initialization and write failures.

## Electron integration

Initialize filesystem collections in the main process once. Accept a narrow set of validated IPC requests from the renderer and return only the required rows. Do not expose arbitrary filesystem paths or a complete database handle to untrusted renderer content. CamaDB does not provide IPC, connection pooling, SQL drivers, or a server.

## Collection lifecycle

Await `initCollection()` before use; it prepares metadata and the configured cache. On filesystem and IndexedDB, `describeCollection`, `collectionExists`, and paged `listCollections` inspect declared metadata without creating a collection. These catalogue methods are not supported by every adapter.

```ts
const page = await database.listCollections({ limit: 20 });
for (const item of page.collections) console.log(item.name, item.columns);
if (page.nextCursor) {
  const next = await database.listCollections({ after: page.nextCursor, limit: 20 });
  console.log(next.collections);
}
```

`destroy()` deletes storage; it is not a connection-close method. CamaDB currently has no public `close()` API. See [operations](operations.md) for shutdown ownership, backups and deletion, and [query recipes](query-recipes.md) for common application operations.
