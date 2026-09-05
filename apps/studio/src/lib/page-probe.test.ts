import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { runStudioProbe } from './page-probe';

const request = <T>(value: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

beforeEach(async () => {
  const databases = await indexedDB.databases();
  await Promise.all(databases.flatMap(({ name }) => (name ? [request(indexedDB.deleteDatabase(name))] : [])));
  const opening = indexedDB.open('studio-test', 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore('notes');
  const database = await request(opening);
  const transaction = database.transaction('notes', 'readwrite');
  const store = transaction.objectStore('notes');
  store.put(
    {
      collectionName: 'notes',
      columns: [],
      indexes: [],
      searchIndexes: ['content'],
      vectorIndexes: [{ field: 'embedding', dimensions: 2 }],
    },
    'collection-metadata',
  );
  store.put({ camaDB: { format: 'records', version: 3 }, generation: 4, nextSequence: 3 }, 'record-metadata');
  store.put(
    { generation: 1, sequence: 0, value: { _id: 'a', content: 'Cobalt harbor', embedding: [1, 0], category: 'note' } },
    'record:a',
  );
  store.put(
    { generation: 2, sequence: 1, value: { _id: 'b', content: 'Quiet garden', embedding: [0, 1], category: 'note' } },
    'record:b',
  );
  store.put({ deleted: true, generation: 4, sequence: 2 }, 'record:c');
  await transactionDone(transaction);
  database.close();
});

it('discovers databases and identifies CamaDB collections without mutation', async () => {
  await expect(runStudioProbe({ type: 'list-databases' })).resolves.toMatchObject({
    result: { type: 'databases', databases: [{ name: 'studio-test', version: 1 }] },
  });
  await expect(runStudioProbe({ type: 'inspect-database', database: 'studio-test' })).resolves.toMatchObject({
    result: {
      type: 'database',
      collections: [
        {
          name: 'notes',
          generation: 4,
          liveRecords: 2,
          tombstones: 1,
          columns: [],
          indexes: [],
          searchIndexes: ['content'],
          vectorIndexes: [{ field: 'embedding', dimensions: 2 }],
        },
      ],
    },
  });
});

it('reads records in bounded pages and omits tombstones', async () => {
  const response = await runStudioProbe({
    type: 'read-records',
    database: 'studio-test',
    collection: 'notes',
    limit: 1,
  });
  expect(response.result).toMatchObject({
    type: 'records',
    records: [{ cursor: 'record:a', document: { _id: 'a' } }],
    nextCursor: 'record:a',
  });
  if (response.result?.type !== 'records') throw new Error('Expected records response');
  await expect(
    runStudioProbe({
      type: 'read-records',
      database: 'studio-test',
      collection: 'notes',
      after: response.result.nextCursor,
      limit: 2,
    }),
  ).resolves.toMatchObject({ result: { records: [{ cursor: 'record:b', document: { _id: 'b' } }] } });
});

it('runs inspectable document, text, vector and hybrid queries', async () => {
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'document', filter: { category: 'note', _id: 'a' } },
      limit: 10,
      scanLimit: 100,
    }),
  ).resolves.toMatchObject({ result: { type: 'query', hits: [{ document: { _id: 'a' } }] } });
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'text', text: 'cobalt harbor', match: 'all' },
      limit: 10,
      scanLimit: 100,
    }),
  ).resolves.toMatchObject({
    result: { hits: [{ document: { _id: 'a' }, explanation: { matchedTerms: ['cobalt', 'harbor'] } }] },
  });
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'vector', field: 'embedding', vector: [1, 0] },
      limit: 1,
      scanLimit: 100,
    }),
  ).resolves.toMatchObject({ result: { hits: [{ document: { _id: 'a' }, score: 1 }] } });
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'hybrid', text: 'garden', field: 'embedding', vector: [0, 1] },
      limit: 1,
      scanLimit: 100,
    }),
  ).resolves.toMatchObject({
    result: { hits: [{ document: { _id: 'b' }, explanation: { textRank: 1, vectorRank: 1 } }] },
  });
});

it('does not create an unknown database while probing it', async () => {
  await expect(runStudioProbe({ type: 'inspect-database', database: 'missing' })).resolves.toMatchObject({
    error: 'Database "missing" does not exist in this page origin',
  });
  expect((await indexedDB.databases()).some(({ name }) => name === 'missing')).toBe(false);
});

it('replaces and deletes records through the versioned generation contract', async () => {
  await expect(
    runStudioProbe({
      type: 'replace-record',
      database: 'studio-test',
      collection: 'notes',
      id: 'a',
      expectedGeneration: 1,
      document: { _id: 'a', content: 'Revised harbor', embedding: [1, 0] },
    }),
  ).resolves.toMatchObject({
    result: { type: 'mutation', action: 'replace', id: 'a', generation: 5, changed: true },
  });
  await expect(
    runStudioProbe({
      type: 'delete-record',
      database: 'studio-test',
      collection: 'notes',
      id: 'b',
      expectedGeneration: 2,
    }),
  ).resolves.toMatchObject({
    result: { type: 'mutation', action: 'delete', id: 'b', generation: 6, changed: true },
  });
  await expect(runStudioProbe({ type: 'inspect-database', database: 'studio-test' })).resolves.toMatchObject({
    result: { collections: [{ generation: 6, liveRecords: 1, tombstones: 2 }] },
  });
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'text', text: 'revised' },
      limit: 10,
      scanLimit: 100,
    }),
  ).resolves.toMatchObject({
    result: { hits: [{ document: { _id: 'a', content: 'Revised harbor' } }] },
  });
});

it('rejects replacement documents that change identity', async () => {
  await expect(
    runStudioProbe({
      type: 'replace-record',
      database: 'studio-test',
      collection: 'notes',
      id: 'a',
      expectedGeneration: 1,
      document: { _id: 'changed' },
    }),
  ).resolves.toMatchObject({ error: 'Replacement document must preserve its string _id' });
});

it('rejects stale mutations instead of overwriting a newer record generation', async () => {
  await expect(
    runStudioProbe({
      type: 'delete-record',
      database: 'studio-test',
      collection: 'notes',
      id: 'a',
      expectedGeneration: 0,
    }),
  ).resolves.toMatchObject({ error: 'This record changed after Studio loaded it; refresh before mutating it' });
  await expect(
    runStudioProbe({
      type: 'query-records',
      database: 'studio-test',
      collection: 'notes',
      query: { kind: 'document', filter: { _id: 'a' } },
      limit: 1,
      scanLimit: 10,
    }),
  ).resolves.toMatchObject({ result: { hits: [{ document: { _id: 'a' } }] } });
});

it('invalidates a live collection cache and rebuilds derived indexes after Studio mutations', async () => {
  const databaseName = `studio-live-${Date.now()}`;
  const cama = new Cama({
    path: databaseName,
    persistenceAdapter: PersistenceAdapterEnum.IndexedDb,
    cache: { mode: 'lru', maxBytes: 1024 * 1024, maxRecords: 10 },
  });
  const collection = await cama.initCollection<{
    content: string;
    category: string;
  }>('notes', {
    columns: [],
    indexes: ['category'],
    searchIndexes: ['content'],
  });

  try {
    await collection.insertMany([
      { _id: 'a', content: 'Cobalt harbor', category: 'draft' },
      { _id: 'b', content: 'Quiet garden', category: 'published' },
    ]);

    await expect(collection.findMany({ _id: 'a' })).resolves.toMatchObject({
      rows: [{ content: 'Cobalt harbor', category: 'draft' }],
    });
    await expect(collection.count({ category: 'draft' })).resolves.toBe(1);
    await expect(collection.searchText('cobalt')).resolves.toHaveLength(1);

    await expect(
      runStudioProbe({
        type: 'replace-record',
        database: databaseName,
        collection: 'notes',
        id: 'a',
        expectedGeneration: 1,
        document: { _id: 'a', content: 'Revised lighthouse', category: 'published' },
      }),
    ).resolves.toMatchObject({ result: { type: 'mutation', action: 'replace', changed: true } });

    await expect(collection.findMany({ _id: 'a' })).resolves.toMatchObject({
      rows: [{ content: 'Revised lighthouse', category: 'published' }],
    });
    await expect(collection.count({ category: 'draft' })).resolves.toBe(0);
    await expect(collection.count({ category: 'published' })).resolves.toBe(2);
    await expect(collection.searchText('cobalt')).resolves.toHaveLength(0);
    await expect(collection.searchText('lighthouse')).resolves.toMatchObject([{ document: { _id: 'a' } }]);

    await expect(
      runStudioProbe({
        type: 'delete-record',
        database: databaseName,
        collection: 'notes',
        id: 'a',
        expectedGeneration: 2,
      }),
    ).resolves.toMatchObject({ result: { type: 'mutation', action: 'delete', changed: true } });
    await expect(collection.count()).resolves.toBe(1);
    await expect(collection.searchText('lighthouse')).resolves.toHaveLength(0);
  } finally {
    await collection.destroy();
  }
});
