# CamaDB

**An embedded TypeScript database for local application data and AI memory.**
Store typed documents, query offline, and combine metadata filters, full-text search and vector similarity without running a database server.

[Documentation](https://elmarti.github.io/camadb/docs/index.html) · [Website](https://elmarti.github.io/camadb/) · [Try the local demo](https://elmarti.github.io/camadb/demo/index.html) · [API reference](https://elmarti.github.io/camadb/docs/modules.html)

## Is it a fit?

Use CamaDB for offline application state, locally captured query results, searchable knowledge collections, and inspectable AI memory in **Node.js 22+, Electron, or browsers**. It is MIT licensed; no account or hosted service is required.

- **Typed documents:** define a collection's type once; insert, filter, update and retrieve with that contract.
- **Local persistence:** filesystem, IndexedDB, localStorage and in-memory adapters.
- **Retrieval:** scalar indexes, deterministic BM25 text search, exact vector search and explainable hybrid ranking.
- **Operational controls:** bounded mutation batches, recovery, compaction and optional record caching.
- **Optional packages:** embedding provenance and memory workflows; transport-independent synchronization contracts.

CamaDB is not a SQL engine or a multi-writer database server. Exact vector search is not an ANN index. Result arrays and indexes still consume memory: selected 100k-record benchmarks are measurements, not a universal capacity guarantee. Read the [workload guidance](https://elmarti.github.io/camadb/docs/documents/docs_supported-workloads.html) before choosing it for a large dataset.

## Install the v3 release candidate

```sh
npm install @camadb/core@rc
```

**These docs describe v3.** The unqualified `camadb` package can resolve to v2; use the explicit release channel and commit your lockfile. Release candidates are for evaluation before stable rollout. Version 3 does **not** open or automatically migrate version 2 stores. Export using your compatible v2 application, then import into a new v3 location. See [migration](https://elmarti.github.io/camadb/docs/documents/docs_migration-2.x.html) and [release status](https://elmarti.github.io/camadb/docs/documents/docs_release-readiness.html).

## Your first collection

This TypeScript example runs inside an async function on Node.js or in an Electron main process:

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Note {
  _id: string;
  title: string;
  body: string;
  topic: string;
}

async function main() {
  const db = new Cama({
    path: './notes-v3',
    persistenceAdapter: PersistenceAdapterEnum.FS,
  });
  const notes = await db.initCollection<Note>('notes', {
    columns: [],
    indexes: ['topic'],
    searchIndexes: ['title', 'body'],
  });

  const { insertedId } = await notes.insertOne({
    title: 'Local first',
    body: 'Keep useful knowledge on this device.',
    topic: 'architecture',
  });
  const page = await notes.findMany({ topic: 'architecture' }, { limit: 20 });
  const hits = await notes.searchText('knowledge', { limit: 5 });
  await notes.updateMany({ _id: insertedId }, { $set: { title: 'Offline knowledge' } });
  console.log(page.rows, hits);
}

main().catch(console.error);
```

For a browser, select `PersistenceAdapterEnum.IndexedDb` and use a database name for `path`. Run initialization on the client, not during server rendering. In Electron, keep filesystem access in the main process and expose a narrow IPC API. Never use `destroy()` as a close operation: it deletes the collection.

## Learn by task

| I want to…                                       | Start here                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Choose an adapter and run a complete example     | [Getting started](https://elmarti.github.io/camadb/docs/documents/docs_getting-started.html)           |
| Filter, paginate, update and import records      | [Query recipes](https://elmarti.github.io/camadb/docs/documents/docs_query-recipes.html)               |
| Tune metadata, text, vector and hybrid retrieval | [Retrieval guide](https://elmarti.github.io/camadb/docs/documents/docs_retrieval.html)                 |
| Build local AI memory with provenance            | [Memory examples](https://elmarti.github.io/camadb/docs/documents/packages_memory_README.html)         |
| Understand synchronization and conflicts         | [Sync examples](https://elmarti.github.io/camadb/docs/documents/docs_synchronization.html)             |
| Diagnose storage, cache or quota problems        | [Operations and troubleshooting](https://elmarti.github.io/camadb/docs/documents/docs_operations.html) |
| Look up a signature or return type               | [Generated API reference](https://elmarti.github.io/camadb/docs/modules.html)                          |

The [source guides](docs/start.md) are also readable directly in this repository.

## Packages and applications

| Workspace             | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `@camadb/core`        | Database, collection and retrieval API                                                   |
| `camadb`              | Historical package name; re-exports core, without v2 storage compatibility               |
| `@camadb/memory`      | Local memory lifecycle and embedding provenance                                          |
| `@camadb/sync`        | Sync protocol and in-memory reference replica; supply your own persistence and transport |
| `apps/knowledge-demo` | Offline browser knowledge lab                                                            |
| `apps/studio`         | Browser extension for inspecting supported local stores                                  |
| `apps/website`        | Public website, guides and generated API docs                                            |

## Contribute

```sh
yarn install --frozen-lockfile
yarn validate
yarn docs:check
```

Use Node.js 22+ and Yarn Classic 1.22.22. See [development](docs/development.md), [contributing](CONTRIBUTING.md), and [documentation authoring](docs/documentation.md). `yarn build` includes the static website, guides and API reference. Releases use Changesets; see [publishing](docs/versioning-and-publishing.md).

Report reproducible problems in [GitHub issues](https://github.com/elmarti/camadb/issues). Include the package version, adapter, runtime and a minimal example without private data.
