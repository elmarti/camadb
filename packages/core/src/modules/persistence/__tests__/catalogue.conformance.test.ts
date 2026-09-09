import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Cama, PersistenceAdapterEnum } from '../../..';
import { openDB, deleteDB } from 'idb';

for (const adapter of [PersistenceAdapterEnum.FS, PersistenceAdapterEnum.IndexedDb]) {
  describe(`${adapter} catalogue conformance`, () => {
    let location: string;
    let db: Cama;
    beforeEach(async () => {
      location =
        adapter === 'fs'
          ? await fs.mkdtemp(path.join(os.tmpdir(), 'catalogue-conformance-'))
          : `catalogue-${Date.now()}-${Math.random()}`;
      db = new Cama({ persistenceAdapter: adapter, path: location });
    });
    afterEach(async () => {
      if (adapter === 'fs') await fs.rm(location, { recursive: true, force: true });
      else await deleteDB(location);
    });
    async function setMetadata(name: string, metadata: unknown) {
      if (adapter === 'fs') {
        await fs.mkdir(path.join(location, name), { recursive: true });
        await fs.writeFile(path.join(location, name, 'meta.json'), JSON.stringify(metadata));
      } else {
        let connection = await openDB(location);
        if (!connection.objectStoreNames.contains(name)) {
          const version = connection.version + 1;
          connection.close();
          connection = await openDB(location, version, { upgrade: (d) => d.createObjectStore(name) });
        }
        await connection.put(name, metadata, 'collection-metadata');
        connection.close();
      }
    }
    test('missing catalogue checks do not create storage', async () => {
      expect(await db.listCollections()).toEqual({ collections: [] });
      expect(await db.describeCollection('missing')).toBeUndefined();
      expect(await db.collectionExists('missing')).toBe(false);
      const persisted =
        adapter === 'fs'
          ? (await fs.readdir(location)).length > 0
          : (await indexedDB.databases()).some((d) => d.name === location);
      expect(persisted).toBe(false);
    });
    test('public initialization, declared metadata, cursor pagination and reopen agree', async () => {
      for (const name of ['zeta', 'alpha', 'middle']) {
        const collection = await db.initCollection(name, {
          columns: [{ title: 'createdAt', type: 'date' }],
          indexes: ['createdAt'],
        });
        await collection.insertOne({ _id: 'one', createdAt: new Date('2026-01-01') });
      }
      const first = await db.listCollections({ limit: 2 });
      expect(first.collections.map((c) => c.name)).toEqual(['alpha', 'middle']);
      expect(first.nextCursor).toBe('middle');
      expect((await db.listCollections({ after: first.nextCursor, limit: 2 })).collections.map((c) => c.name)).toEqual([
        'zeta',
      ]);
      const reopened = new Cama({ persistenceAdapter: adapter, path: location });
      expect(await reopened.describeCollection('alpha')).toEqual({
        name: 'alpha',
        columns: [{ title: 'createdAt', type: 'date' }],
        indexes: ['createdAt'],
      });
      expect(await reopened.collectionExists('alpha')).toBe(true);
      expect((await reopened.listCollections({ after: 'zeta' })).collections).toEqual([]);
      first.collections[0].columns[0].type = 'mutated';
      expect((await reopened.describeCollection('alpha'))!.columns[0].type).toBe('date');
    });
    test('invalid names, pages and malformed metadata fail consistently', async () => {
      for (const name of ['', '..', '../x']) await expect(db.describeCollection(name)).rejects.toThrow('name');
      for (const limit of [0, 101, 1.5]) await expect(db.listCollections({ limit })).rejects.toThrow('page size');
      await setMetadata('broken', { collectionName: 'broken', columns: 'bad', indexes: [] });
      await expect(db.describeCollection('broken')).rejects.toThrow('metadata');
      await expect(db.collectionExists('broken')).rejects.toThrow('metadata');
      await expect(db.listCollections()).rejects.toThrow('metadata');
    });
    test('oversized metadata is rejected', async () => {
      await setMetadata('large', { collectionName: 'large', columns: [], indexes: [], padding: 'x'.repeat(262145) });
      await expect(db.describeCollection('large')).rejects.toThrow('256 KiB');
    });
  });
}

describe('IndexedDB catalogue isolation and non-mutation', () => {
  test('reads metadata only, preserves version/payload and skips non-Cama stores', async () => {
    const name = `catalogue-isolation-${Math.random()}`;
    const raw = await openDB(name, 7, {
      upgrade(db) {
        db.createObjectStore('records');
        db.createObjectStore('unrelated');
      },
    });
    const metadata = { collectionName: 'records', columns: [], indexes: [] };
    await raw.put('records', metadata, 'collection-metadata');
    await raw.put('records', { legacy: true }, 'data');
    const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.IndexedDb, path: name });
    const get = jest.spyOn(IDBObjectStore.prototype, 'get');
    try {
      expect((await db.listCollections()).collections.map((c) => c.name)).toEqual(['records']);
      expect(await db.describeCollection('unrelated')).toBeUndefined();
      expect(get.mock.calls.every(([key]) => key === 'collection-metadata')).toBe(true);
      get.mockRestore();
      expect(raw.version).toBe(7);
      expect(Array.from(raw.objectStoreNames)).toEqual(['records', 'unrelated']);
      expect(await raw.get('records', 'data')).toEqual({ legacy: true });
      expect(await raw.get('records', 'collection-metadata')).toEqual(metadata);
      const other = new Cama({ persistenceAdapter: PersistenceAdapterEnum.IndexedDb, path: `${name}-other` });
      expect(await other.collectionExists('records')).toBe(false);
    } finally {
      get.mockRestore();
      raw.close();
      await deleteDB(name);
    }
  });
  test('inspection connections do not block a later schema upgrade', async () => {
    const name = `catalogue-upgrade-${Math.random()}`;
    const raw = await openDB(name, 1, { upgrade: (d) => d.createObjectStore('records') });
    raw.close();
    const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.IndexedDb, path: name });
    await db.listCollections();
    const next = await openDB(name, 2, { upgrade: (d) => d.createObjectStore('next') });
    expect(next.version).toBe(2);
    next.close();
    await deleteDB(name);
  });
  test('unsupported catalogue adapters fail explicitly as rejected promises', async () => {
    const db = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
    await expect(db.listCollections()).rejects.toThrow('not supported');
    await expect(db.describeCollection('a')).rejects.toThrow('not supported');
    await expect(db.collectionExists('a')).rejects.toThrow('not supported');
  });
});
