# CamaDB

CamaDB is a NoSQL embedded database written in pure TypeScript for Node, Electron and browser-based environments.

Node.js integrations require Node.js 22 or newer. Packages support CommonJS `require()`, ESM `import`, and TypeScript declarations; browser and Electron renderer applications use the browser-compatible adapters.

This repository is a workspace. The existing `camadb` import is preserved by a compatibility package; new development may use `@camadb/core`. AI memory and embedding provenance contracts live in `@camadb/memory`, while Studio and examples are private workspace applications.

See [workspace architecture](docs/architecture.md), [metadata indexes](docs/indexes.md), [local development](docs/development.md), [versioning and publishing](docs/versioning-and-publishing.md), and the [2.x compatibility policy](docs/migration-2.x.md).

Stable releases are automated through a Changesets release pull request on `main`. Pushes to `develop` publish unique snapshot releases under npm's `alpha` dist-tag.

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Why?
I was struggling to find a solution for Electron-based projects that deal with larger datasets in the main thread.

- I had issues getting SQLite to work with webpack due to its native build
- SQLite doesn't (by default) return native JS data types (Dates in particular)
- Other NoSQL embedded databases seem to be largely abandoned
- Most other NoSQL embedded databases seem to be limited by V8's hard string length limits

## Goals
- Fast querying/insertion/manipulation of data, up to 1 million rows
- Frictionless integration with supported Node.js, Electron and browser runtimes
- Rich API 
- Full TypeScript support
- Simplicity and versatility - This is built for storing data in dynamic structures

## Current state
This is still under active development. Metadata equality and range indexes are
available; rich text search is not yet implemented.

## Getting started
[Documentation](https://elmarti.github.io/camadb/classes/Collection.html)
### Installing
```
yarn add camadb
```
OR 
```
npm install camadb --save
```

### Initializing the database
All of these config options are optional:
- `path` - Where you want the data to be stored - default is `./.cama` or `cama` for indexeddb and localstorage
- `persistenceAdapter` - How you want to persist your data - `fs`, `indexeddb`, `localstorage` or `inmemory`
- `logLevel` - info or debug
```
  import { Cama } from 'camadb'
  const database = new Cama({
    path: './.cama',
    persistenceAdapter: 'fs',
    logLevel: 'debug'
  });
```

### Initializing a collection
- Use the columns field to add specific data types for rows. This does _need_ to be done for each column, but is essential for date objects
- Use `indexes` for frequently queried top-level scalar fields. See the [index guide](docs/indexes.md) for supported predicates and tradeoffs.
```
 interface Message {
   _id: string;
   name: string;
   description: string;
   createdAt: Date;
 }

 const collection = await database.initCollection<Message>('test', {
    columns: [{
      type:'date',
      title:'createdAt'
    }],
    indexes: ['name'],
  });
```

In 2.x, the type parameter could be supplied independently to methods such as
`findMany<T>()`. In 3.x, move it to `initCollection<T>()` once so inserts,
filters, updates, aggregations, and returned rows all share the same document
contract:

```ts
// 2.x
const messages = await database.initCollection('messages', config);
await messages.insertOne<Message>(message);
const result = await messages.findMany<Message>({ _id: message._id });

// 3.x
const messages = await database.initCollection<Message>('messages', config);
await messages.insertOne(message);
const result = await messages.findMany({ _id: message._id });
```

### Insert one
```
 await collection.insertOne({
    _id: 'test',
    name: 'Dummy field',
    description: `Data`,
  });
```
### Insert many
```
  await collection.insertMany([{
       _id: 'test',
       name: 'Dummy field',
       description: `Data`,
  }]);

```

Every newly inserted document has an immutable string `_id`. Supply one when
importing an existing identity, or omit it and use the `insertedId` /
`insertedIds` returned by the mutation. Duplicate IDs reject without partially
writing an insert batch.

### CRUD results and upsert

```ts
const count = await collection.count({ name: 'Dummy field' });
const updated = await collection.updateMany(
  { name: 'Dummy field' },
  { $set: { description: 'Updated' } },
);
const removed = await collection.deleteOne({ _id: 'test' });
const upserted = await collection.upsert(
  { name: 'New message' },
  { name: 'New message', description: 'Created when absent', createdAt: new Date() },
);
```

Mutation results report inserted IDs and matched, modified, upserted, or
deleted counts. `deleteMany` removes every match; `deleteOne` removes only the
first match in collection order.

### Find many 
CamaDB uses a MongoDB style query language, powered by [SiftJS](https://github.com/crcn/sift.js/). Have a look at that project to see the full capabilities of that library.
```
 const findResult = await collection.findMany({
    _id: {
      $gte: 50000,
    },
  },
    {
      sort:{
        desc: x => x._id
      },
      offset: 100,
      limit: 100
    });
```

### Updating
Again we use a MongoDB style language for data updates, for this we use  [obop](https://github.com/kawanet/obop)
```
  await collection.updateMany({
    _id:3
  }, {
    $set: {
      steve:"steve"
    }
  });
```

### Aggregation
We use [Mingo](https://github.com/kofrasa/mingo) for aggregation - currently lookup commands aren't supported.
```
 const aggregationResult = await collection.aggregate([{
    $match:{
      _id:3
    }
  }]);
``` 
