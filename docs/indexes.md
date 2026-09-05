# Metadata indexes

CamaDB can maintain in-memory indexes for selected top-level document fields.
Declare them when the collection is first created:

```ts
const messages = await database.initCollection<Message>('messages', {
  columns: [{ title: 'createdAt', type: 'date' }],
  indexes: ['author'],
});
```

Index definitions are collection metadata. Persistent adapters recover the
definitions stored with the collection rather than silently replacing them
with a different configuration on reopen. Index contents are derived state:
the committed records remain authoritative, and CamaDB rebuilds the index after
opening a collection or observing an out-of-process storage revision.

## Supported queries

Indexes currently narrow these predicates:

- direct scalar equality and `$eq`
- `$gt`, `$gte`, `$lt`, and `$lte` over a consistently typed scalar field
- implicit top-level intersections and `$and` intersections

Indexed values may be strings, finite numbers, booleans, or `null`. `_id`
lookups already use the adapter's direct-record path and do not need an index.
Nested field paths and operators such as `$or`, `$in`, `$ne`, and `$exists`
continue to use the normal scan path. If an `$and` contains both supported and
unsupported predicates, the supported index may select candidates, but the
complete query is always evaluated against those records before results or
mutations are returned.

Indexes preserve collection order and are maintained only after a storage
mutation commits successfully. Failed writes therefore cannot advance index
state. An index never changes query semantics: unsupported or unsafe cases,
including mixed-type range comparisons, fall back to a scan.

## When to use an index

Index a field when selective equality or range queries run often enough to
justify faster reads. Avoid indexing fields that are rarely queried, have very
low selectivity, or belong to a write-heavy collection where the read saving
does not outweigh maintenance and memory costs.

The first indexed query after opening a collection performs an O(n) rebuild.
Steady indexed lookups avoid hydrating every record, but index memory grows with
the number of indexed scalar values: approximately O(records × indexed fields).
Measure the real workload with `yarn benchmark:index`; the reproducible baseline
and current comparison are documented in [the Wave 5 benchmark report](benchmarks/wave5-indexes.md).

For datasets whose required indexes cannot fit comfortably in the application's
memory budget, or workloads needing disk-native indexes and complex query
planning, use SQLite or another dedicated database.
