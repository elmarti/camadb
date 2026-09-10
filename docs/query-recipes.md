# Query and mutation recipes

The examples below share this setup and run in an async function. Use IndexedDB instead of in-memory persistence to retain browser data.

```ts
import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Task {
  _id: string;
  title: string;
  priority: number;
  done: boolean;
  createdAt: Date;
}
const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
const tasks = await db.initCollection<Task>('tasks', {
  columns: [{ title: 'createdAt', type: 'date' }],
  indexes: ['done', 'priority'],
  searchIndexes: ['title'],
});
```

## Insert and preserve identities

```ts
const inserted = await tasks.insertMany([
  { _id: 'task-1', title: 'Ship docs', priority: 3, done: false, createdAt: new Date() },
  { title: 'Review examples', priority: 2, done: false, createdAt: new Date() },
]);
console.log(inserted.insertedIds, inserted.insertedCount);
```

Inserts reject duplicate IDs without partially applying the batch. Updating `_id` is unsupported. Input TypeScript types do not replace runtime validation at your application's boundary.

## Filter, sort and paginate

```ts
const page = await tasks.findMany(
  { done: false, priority: { $gte: 2 } },
  { sort: [{ desc: (row) => row.priority }, { asc: (row) => row._id }], offset: 0, limit: 20 },
);
console.log(page.rows, page.count, page.totalCount);
const count = await tasks.count({ done: false });
```

`count` is the number of returned rows; `totalCount` is the match count before pagination.

Filters use Sift-style predicates. Supported scalar metadata predicates can narrow candidates; unsupported expressions fall back to scans. Sorts and general filters may still require substantial work before pagination. `limit` bounds returned rows, not necessarily the working set. Include a stable tie-breaker when paginating. Offset pages across concurrent mutations are not a snapshot.

For identity lookup, use a string: `await tasks.findMany({ _id: 'task-1' })`. Do not use numeric IDs copied from obsolete v2 examples.

## Update, upsert and delete

```ts
const changed = await tasks.updateMany({ done: false }, { $set: { priority: 4 } });
const ensured = await tasks.upsert(
  { _id: 'daily-review' },
  { _id: 'daily-review', title: 'Review queue', priority: 1, done: false, createdAt: new Date() },
);
const deleted = await tasks.deleteOne({ _id: 'task-1' });
console.log(changed.modifiedCount, ensured.upsertedCount, deleted.deletedCount);
```

`upsert` updates every match or inserts the supplied document when absent; inspect matched/modified/upserted counts. `deleteOne` removes the first match in collection order; `deleteMany` removes all matches. Mutation promises acknowledge their operation, not a transaction spanning several API calls.

## Aggregate

```ts
const counts = await tasks.aggregate<{ _id: boolean; count: number }>([
  { $group: { _id: '$done', count: { $sum: 1 } } },
]);
console.log(counts);
```

Aggregation uses Mingo over local documents. The result type describes the pipeline's output, not runtime validation. Cross-collection lookup is not supported; perform application-controlled joins or choose a relational database where that is the primary workload.

## Import with backpressure

```ts
import type { InsertDocument } from '@camadb/core';

async function importTasks(rows: AsyncIterable<InsertDocument<Task>>) {
  let batch: InsertDocument<Task>[] = [];
  for await (const row of rows) {
    batch.push(row);
    if (batch.length === 500) {
      await tasks.insertMany(batch);
      batch = [];
    }
  }
  if (batch.length) await tasks.insertMany(batch);
}
```

Each atomic mutation is limited to 10,000 records and each record to 1 MiB. A streaming producer plus awaited batches avoids accumulating the whole import. A later failure leaves earlier committed batches in place: track progress and make restart behavior explicit. A cache budget does not bound input arrays or result arrays.
