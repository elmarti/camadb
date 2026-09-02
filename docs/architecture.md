# Workspace architecture

## Tooling decision

CamaDB uses Yarn Classic workspaces because the existing repository and lockfile already use Yarn, TypeScript project references for ordered builds and type-checking, Jest for package and integration tests, ESLint/Prettier for shared style, and a small dependency-ordered npm publisher. This keeps the migration free of a second orchestration layer. The root owns all developer tooling and configuration.

## Ownership and dependency direction

| Workspace            | Ownership and public API                                                                     | May depend on                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `@camadb/core`       | `Cama`, collections, query contracts, built-in compatibility adapters, public database types | third-party runtime libraries only                                              |
| `camadb`             | legacy package name; re-exports the complete core public API                                 | `@camadb/core`                                                                  |
| `@camadb/memory`     | memory, retrieval, and embedding-provenance contracts                                        | `@camadb/core`; embedding providers remain optional implementation dependencies |
| `@camadb/test-utils` | shared fixtures/builders for tests and benchmarks                                            | public workspace APIs only; never a production dependency                       |
| Studio and examples  | private applications and consumer validation                                                 | published package APIs only                                                     |

Dependencies point from applications and higher-level capabilities toward core. Core must never import memory, Studio, examples, test utilities, or an external embedding provider. Package source and build directories are private: cross-package imports use package names and exported entry points only. `yarn check:boundaries` enforces these rules.

## Runtime boundaries

The legacy configuration chooses `fs`, `indexeddb`, `localstorage`, or `inmemory`. Those adapters remain inside core for the first workspace release because construction was historically coupled to the collection container. Explicit composition has removed that coupling mechanism and runtime metadata. The compatibility facade preserves every supported root import while later adapter packages can implement the exported `IPersistenceAdapter` contract without importing core internals.

CamaDB 3 adapters expose bounded record operations in addition to compatibility collection operations. See [record-oriented storage](./storage.md) for commit boundaries, page and batch limits, compaction, and migration behavior.

Node filesystem code is selected only for the `fs` adapter. IndexedDB and localStorage implementations remain browser-specific. Memory is runtime-neutral and does not select an embedding SDK.

## Future packages

New adapters depend on `@camadb/core`; `@camadb/core` must not depend on them. Studio stays in `apps/`, examples in `examples/`, reusable benchmarks/test helpers in private workspace packages, and independently consumable features in `packages/` with explicit exports.
