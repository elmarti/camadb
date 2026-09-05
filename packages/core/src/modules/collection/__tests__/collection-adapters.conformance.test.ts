import { promises as nodeFs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Cama } from '../../../index';
import { ICollection } from '../../../interfaces/collection.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { TYPES } from '../../../types';
import { CacheMode } from '../../../interfaces/cache.interface';

interface RecordDocument {
  name: string;
  active: boolean;
  score?: number;
  embedding?: number[];
}

interface CollectionContext {
  collection: ICollection<RecordDocument>;
  cleanup(): Promise<void>;
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const config = {
  columns: [],
  indexes: ['name', 'active', 'score'],
  searchIndexes: ['name'],
  vectorIndexes: [{ field: 'embedding', dimensions: 3 }],
};

const collectionCrudConformance = (adapterName: string, createContext: () => Promise<CollectionContext>): void => {
  describe(`${adapterName} collection CRUD conformance`, () => {
    let context: CollectionContext;

    beforeEach(async () => {
      context = await createContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('enforces generated and unique identities', async () => {
      const first = await context.collection.insertOne({ name: 'first', active: true });
      expect(first.insertedId).toEqual(expect.any(String));

      await context.collection.insertOne({ _id: 'provided', name: 'second', active: true });
      await expect(
        context.collection.insertOne({
          _id: 'provided',
          name: 'duplicate',
          active: false,
        }),
      ).rejects.toThrow('Duplicate _id');
      await expect(context.collection.count()).resolves.toBe(2);
    });

    it('supports count, update, delete, and upsert result contracts', async () => {
      await context.collection.insertMany([
        { name: 'first', active: true },
        { name: 'second', active: true },
      ]);

      await expect(context.collection.updateMany({ active: true }, { $set: { active: false } })).resolves.toMatchObject(
        { matchedCount: 2, modifiedCount: 2 },
      );
      await expect(context.collection.count({ active: false })).resolves.toBe(2);
      await expect(context.collection.deleteOne({ active: false })).resolves.toMatchObject({ deletedCount: 1 });
      await expect(context.collection.deleteMany({ active: false })).resolves.toMatchObject({ deletedCount: 1 });
      await expect(
        context.collection.upsert({ name: 'created' }, { name: 'created', active: true }),
      ).resolves.toMatchObject({ upsertedCount: 1, upsertedId: expect.any(String) });
    });

    it('uses bounded record operations for identity queries and mutations', async () => {
      await context.collection.insertMany([
        { _id: 'first', name: 'first', active: true },
        { _id: 'second', name: 'second', active: true },
      ]);
      const adapter = context.collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
      expect(adapter?.getRecord).toEqual(expect.any(Function));
      const hydrate = jest.spyOn(adapter as IPersistenceAdapter, 'getData');

      await expect(context.collection.findMany({ _id: 'first' })).resolves.toMatchObject({ count: 1 });
      await expect(context.collection.updateMany({ _id: 'first' }, { $set: { active: false } })).resolves.toMatchObject(
        { modifiedCount: 1 },
      );
      await expect(context.collection.count({ _id: 'first' })).resolves.toBe(1);
      await expect(context.collection.deleteOne({ _id: 'second' })).resolves.toMatchObject({ deletedCount: 1 });
      expect(hydrate).not.toHaveBeenCalled();
    });

    it('maintains metadata indexes across insert, range update, and delete', async () => {
      await context.collection.insertMany([
        { _id: 'first', name: 'a', active: true, score: 10 },
        { _id: 'second', name: 'b', active: true, score: 20 },
        { _id: 'third', name: 'a', active: false, score: 30 },
      ]);
      await expect(context.collection.count({ name: 'a' })).resolves.toBe(2); // build/warm the derived indexes
      const adapter = context.collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
      const hydrate = jest.spyOn(adapter as IPersistenceAdapter, 'getData');

      await expect(context.collection.findMany({ score: { $gte: 20, $lte: 30 } })).resolves.toMatchObject({
        rows: [
          { _id: 'second', score: 20 },
          { _id: 'third', score: 30 },
        ],
      });
      await expect(
        context.collection.updateMany({ score: { $gte: 20 } }, { $set: { name: 'updated' } }),
      ).resolves.toMatchObject({ modifiedCount: 2 });
      await expect(context.collection.count({ name: 'updated' })).resolves.toBe(2);
      await expect(context.collection.deleteOne({ name: 'updated' })).resolves.toMatchObject({ deletedCount: 1 });
      await expect(context.collection.count({ name: 'updated' })).resolves.toBe(1);
      await context.collection.insertOne({ _id: 'fourth', name: 'updated', active: true, score: 40 });
      await expect(context.collection.count({ name: 'updated' })).resolves.toBe(2);
      expect(hydrate).not.toHaveBeenCalled();
    });

    it('maintains ranked text search across metadata filters and mutations', async () => {
      await context.collection.insertMany([
        { _id: 'first', name: 'cobalt harbor record', active: true },
        { _id: 'second', name: 'cobalt cobalt harbor', active: false },
        { _id: 'third', name: 'unrelated record', active: true },
      ]);
      await expect(context.collection.searchText('cobalt harbor', { limit: 10 })).resolves.toMatchObject([
        { document: { _id: 'second' }, matchedTerms: ['cobalt', 'harbor'], score: expect.any(Number) },
        { document: { _id: 'first' } },
      ]);
      const adapter = context.collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
      const hydrate = jest.spyOn(adapter as IPersistenceAdapter, 'getData');
      await expect(context.collection.searchText('cobalt', { filter: { active: true } })).resolves.toMatchObject([
        { document: { _id: 'first' } },
      ]);
      await context.collection.updateMany({ _id: 'first' }, { $set: { name: 'updated searchable value' } });
      await expect(context.collection.searchText('cobalt')).resolves.toMatchObject([
        { document: { _id: 'second' } },
      ]);
      await expect(context.collection.searchText('searchable')).resolves.toMatchObject([
        { document: { _id: 'first' } },
      ]);
      await context.collection.deleteOne({ _id: 'second' });
      await expect(context.collection.searchText('cobalt')).resolves.toEqual([]);
      expect(hydrate).not.toHaveBeenCalled();
    });

    it('performs bounded exact vector search with metadata pre-filtering', async () => {
      await context.collection.insertMany([
        { _id: 'first', name: 'first', active: true, embedding: [1, 0, 0] },
        { _id: 'second', name: 'second', active: false, embedding: [0.9, 0.1, 0] },
        { _id: 'third', name: 'third', active: true, embedding: [-1, 0, 0] },
      ]);
      await expect(context.collection.searchVector('embedding', [1, 0, 0], {
        filter: { active: true },
        limit: 2,
        metric: 'cosine',
      })).resolves.toMatchObject([
        { document: { _id: 'first' }, score: 1 },
        { document: { _id: 'third' }, score: -1 },
      ]);
      const adapter = context.collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
      const hydrate = jest.spyOn(adapter as IPersistenceAdapter, 'getData');
      await expect(context.collection.searchVector('embedding', [1, 0], { limit: 1 }))
        .rejects.toThrow('dimension 2; expected 3');
      expect(hydrate).not.toHaveBeenCalled();
    });
  });
};

for (const mode of ['disabled', 'eager', 'lazy', 'lru'] as CacheMode[]) {
  collectionCrudConformance(`in-memory/${mode}`, async () => {
    const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory, cache: { mode } });
    const collection = await database.initCollection<RecordDocument>('records', config);
    return {
      collection,
      async cleanup() {
        await collection.destroy();
      },
    };
  });

  collectionCrudConformance(`localStorage/${mode}`, async () => {
    const storage = new MemoryStorage();
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
    const database = new Cama({
      path: `crud-${Date.now()}-${Math.random()}`,
      persistenceAdapter: PersistenceAdapterEnum.LocalStorage,
      cache: { mode },
    });
    const collection = await database.initCollection<RecordDocument>('records', config);
    return {
      collection,
      async cleanup() {
        await collection.destroy();
        if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      },
    };
  });

  collectionCrudConformance(`IndexedDB/${mode}`, async () => {
    const database = new Cama({
      path: `crud-${Date.now()}-${Math.random()}`,
      persistenceAdapter: PersistenceAdapterEnum.IndexedDb,
      cache: { mode },
    });
    const collection = await database.initCollection<RecordDocument>('records', config);
    return {
      collection,
      async cleanup() {
        await collection.destroy();
      },
    };
  });

  collectionCrudConformance(`filesystem/${mode}`, async () => {
    const databasePath = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-crud-'));
    const database = new Cama({ path: databasePath, persistenceAdapter: PersistenceAdapterEnum.FS, cache: { mode } });
    const collection = await database.initCollection<RecordDocument>('records', config);
    return {
      collection,
      async cleanup() {
        await collection.destroy().catch(() => undefined);
        await nodeFs.rm(databasePath, { recursive: true, force: true });
      },
    };
  });
}
