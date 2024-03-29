# CamaDB

CamaDB is a NoSQL embedded database written in pure TypeScript for Node, Electron and browser-based environments.

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Why?
I was struggling to find a solution for Electron-based projects that deal with larger datasets in the main thread.

- I had issues getting SQLite to work with webpack due to its native build
- SQLite doesn't (by default) return native JS data types (Dates in particular)
- Other NoSQL embedded databases seem to be largely abandoned
- Most other NoSQL embedded databases seem to be limited by V8's hard string length limits

## Goals
- Fast querying/insertion/manipulation of data, up to 1 million rows
- Frictionless integration with all JS runtimes
- Rich API 
- Full TypeScript support
- Simplicity and versatility - This is built for storing data in dynamic structures

## Current state
This is still under active development and a few features are missing:
- Indexes - We're finding that this is fast even without these, but every little helps
- Rich text search 

## Getting started
[Documentation](https://elmarti.github.io/camadb/classes/Collection.html)
### Installing
```
yarn add reflect-metadata
yarn add camadb
```
OR 
```
npm install reflect-metadata --save
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
- Indexes aren't currently implemented, but the lookup is still very fast across 10 million rows
```
 const collection = await database.initCollection('test', {
    columns: [{
      type:'date',
      title:'date'
    }],
    indexes: [],
  });
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

