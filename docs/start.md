# CamaDB 3 documentation

CamaDB is an embedded TypeScript document database for Node.js 22+, Electron and browsers. Start with the database, add indexes for your query workload, then add memory or sync only when your application needs them.

These guides describe the **v3 release-candidate line**. Install `@camadb/core@rc` for evaluation; commit the resolved version in your lockfile. V2 stores are not opened or converted. See [release readiness](release-readiness.md) before rollout.

## Start building

1. [Getting started](getting-started.md): install, choose an adapter, create and query a collection.
2. [Query recipes](query-recipes.md): identities, dates, pagination, updates, aggregation and batched imports.
3. [Retrieval](retrieval.md): choose between metadata, text, vector and hybrid queries.
4. [Memory](../packages/memory/README.md): remember, recall, explain, edit, export and forget, with optional embeddings.
5. [Synchronization](synchronization.md): offline replay, cursors, conflicts and transport boundaries.

## Operate and troubleshoot

- [Operations](operations.md): errors, quotas, recovery, backups and deletion.
- [Storage](storage.md) and [caching](caching.md): durability, mutation bounds, compaction and memory budgets.
- [Supported workloads](supported-workloads.md) and [benchmark reports](benchmarks/README.md): measured scale and limitations.
- [Collection catalogue](../packages/core/README.md#read-only-collection-catalogue): read declared metadata without opening collections.
- [V2 migration policy](migration-2.x.md): use application-level export/import into a fresh location.
- [Studio](../apps/studio/README.md): inspect supported browser stores.

## API reference

Use the navigation or search to find **core**, **memory**, and **sync** modules. Public functions include signatures and JSDoc from the same source revision as this documentation. `camadb` re-exports the core API. The [API overview](api.md) maps common tasks to methods.

## Contribute

Read [development](development.md), [documentation authoring](documentation.md), and [publishing](versioning-and-publishing.md). Documentation and reference pages are built together and deployed with the public website.
