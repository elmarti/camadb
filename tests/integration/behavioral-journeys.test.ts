import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { CamaMemory } from '@camadb/memory';
import { LocalSyncReplica, SyncInterruptedError, synchronize } from '@camadb/sync';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Cama as CompatibilityCama } from 'camadb';

interface KnowledgeRecord {
  category: string;
  embedding: number[];
  score: number;
  title: string;
}

interface SyncNote {
  _id: string;
  text: string;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

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
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface JourneyEnvironment {
  cleanup(): Promise<void>;
  config: {
    path?: string;
    persistenceAdapter: PersistenceAdapterEnum;
  };
}

const environmentFor = async (adapter: PersistenceAdapterEnum): Promise<JourneyEnvironment> => {
  const name = `journey-${adapter}-${Date.now()}-${Math.random()}`;
  if (adapter === PersistenceAdapterEnum.FS) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-journey-'));
    return {
      cleanup: () => fs.rm(root, { force: true, recursive: true }),
      config: { path: root, persistenceAdapter: adapter },
    };
  }
  if (adapter === PersistenceAdapterEnum.LocalStorage) {
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    });
    return {
      async cleanup() {
        if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      },
      config: { path: name, persistenceAdapter: adapter },
    };
  }
  return {
    async cleanup() {},
    config: {
      ...(adapter === PersistenceAdapterEnum.IndexedDb ? { path: name } : {}),
      persistenceAdapter: adapter,
    },
  };
};

const collectionConfig = {
  columns: [],
  indexes: ['category', 'score'],
  searchIndexes: ['title'],
  vectorIndexes: [{ dimensions: 3, field: 'embedding' }],
};

describe.each([
  ['in-memory', PersistenceAdapterEnum.InMemory],
  ['filesystem / Electron main process', PersistenceAdapterEnum.FS],
  ['IndexedDB', PersistenceAdapterEnum.IndexedDb],
  ['localStorage', PersistenceAdapterEnum.LocalStorage],
] as const)('%s public API journey', (_name, adapter) => {
  it('survives realistic CRUD, retrieval, failure, maintenance and recreation', async () => {
    const environment = await environmentFor(adapter);
    try {
      const Database = adapter === PersistenceAdapterEnum.FS ? CompatibilityCama : Cama;
      expect(Database).toBe(Cama);
      const database = new Database({ ...environment.config, cache: { maxRecords: 2, mode: 'lru' } });
      const original = await database.initCollection<KnowledgeRecord>('knowledge', collectionConfig);
      await original.insertMany([
        { _id: 'harbor', category: 'place', embedding: [1, 0, 0], score: 10, title: 'cobalt harbor' },
        { _id: 'mountain', category: 'place', embedding: [0, 1, 0], score: 20, title: 'amber mountain' },
        { _id: 'archive', category: 'note', embedding: [0.8, 0.2, 0], score: 30, title: 'cobalt archive' },
      ]);

      await expect(
        original.insertOne({
          _id: 'harbor',
          category: 'duplicate',
          embedding: [0, 0, 1],
          score: 0,
          title: 'duplicate',
        }),
      ).rejects.toThrow('Duplicate _id "harbor"');
      await expect(
        original.insertOne({
          _id: 'queue-continued',
          category: 'note',
          embedding: [0, 0, 1],
          score: 40,
          title: 'after failure',
        }),
      ).resolves.toMatchObject({ insertedId: 'queue-continued' });

      await expect(original.count({ category: 'place' })).resolves.toBe(2);
      await expect(original.updateMany({ _id: 'harbor' }, { $set: { score: 11 } })).resolves.toMatchObject({
        matchedCount: 1,
        modifiedCount: 1,
      });
      const textHits = await original.searchText('cobalt');
      expect(new Set(textHits.map(({ document }) => document._id))).toEqual(new Set(['harbor', 'archive']));
      expect(textHits.every(({ matchedTerms }) => matchedTerms.includes('cobalt'))).toBe(true);
      await expect(original.searchVector('embedding', [1, 0, 0], { limit: 1 })).resolves.toMatchObject([
        { document: { _id: 'harbor' }, score: 1 },
      ]);
      const hybrid = await original.searchHybrid({
        candidateLimit: 4,
        fusion: { rankConstant: 10, strategy: 'rrf' },
        limit: 2,
        text: { query: 'cobalt' },
        vector: { field: 'embedding', query: [1, 0, 0] },
      });
      expect(hybrid[0]).toMatchObject({ components: { text: expect.any(Object), vector: expect.any(Object) } });
      expect(hybrid[0].score).toBeCloseTo(
        hybrid[0].components.text!.contribution + hybrid[0].components.vector!.contribution,
      );

      const active =
        adapter === PersistenceAdapterEnum.InMemory
          ? original
          : await new Database(environment.config).initCollection<KnowledgeRecord>('knowledge', collectionConfig);
      await expect(active.findMany({ _id: 'harbor' })).resolves.toMatchObject({
        rows: [{ _id: 'harbor', score: 11, title: 'cobalt harbor' }],
      });
      await expect(active.searchText('after failure')).resolves.toMatchObject([
        { document: { _id: 'queue-continued' } },
      ]);

      await expect(active.deleteOne({ _id: 'archive' })).resolves.toEqual({ acknowledged: true, deletedCount: 1 });
      await active.compact();
      await expect(active.count()).resolves.toBe(3);
      await expect(active.findMany({ _id: 'archive' })).resolves.toMatchObject({ rows: [] });

      await active.destroy();
      const recreated = await new Database(environment.config).initCollection<KnowledgeRecord>(
        'knowledge',
        collectionConfig,
      );
      await expect(recreated.count()).resolves.toBe(0);
      await recreated.destroy();
    } finally {
      await environment.cleanup();
    }
  });
});

it('persists the public memory lifecycle across a filesystem reopen', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camadb-memory-journey-'));
  const config = { path: root, persistenceAdapter: PersistenceAdapterEnum.FS };
  try {
    const first = await CamaMemory.create<{ source: string }>(new Cama(config), {
      collectionName: 'memories',
      now: () => new Date('2026-09-06T12:00:00.000Z'),
    });
    await first.remember({
      category: 'fact',
      content: 'the harbor is cobalt',
      id: 'harbor',
      metadata: { source: 'user' },
    });

    const reopened = await CamaMemory.create<{ source: string }>(new Cama(config), {
      collectionName: 'memories',
      now: () => new Date('2026-09-06T13:00:00.000Z'),
    });
    const [recalled] = await reopened.recall('cobalt harbor');
    expect(recalled).toMatchObject({
      explanation: { strategy: 'text', text: { matchedTerms: ['cobalt', 'harbor'] } },
      memory: { id: 'harbor', metadata: { source: 'user' } },
    });
    expect(reopened.explain(recalled)).toEqual(recalled.explanation);
    await expect(reopened.export()).resolves.toMatchObject({ memories: [{ id: 'harbor' }], schemaVersion: 1 });
    await expect(reopened.forget('harbor')).resolves.toEqual({ forgotten: true, id: 'harbor' });
    await expect(reopened.inspect('harbor')).resolves.toBeUndefined();
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});

it('keeps local sync work available offline and safely resumes interrupted replay', async () => {
  const laptop = new LocalSyncReplica<SyncNote>('laptop');
  const desktop = new LocalSyncReplica<SyncNote>('desktop');
  laptop.put('notes', { _id: 'one', text: 'written offline' });
  laptop.put('notes', { _id: 'two', text: 'also offline' });
  expect(laptop.get('notes', 'one')).toEqual({ _id: 'one', text: 'written offline' });

  const failure = await synchronize(laptop, desktop, {
    beforeApply: (_mutation, cursor) => {
      if (cursor === 1) throw new Error('peer disconnected');
    },
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SyncInterruptedError);
  expect(failure).toMatchObject({ cursor: 1 });

  await expect(synchronize(laptop, desktop, { cursor: 0 })).resolves.toMatchObject({
    applied: 1,
    cursor: 2,
    duplicates: 1,
  });
  expect(desktop.get('notes', 'one')).toEqual({ _id: 'one', text: 'written offline' });
  expect(desktop.get('notes', 'two')).toEqual({ _id: 'two', text: 'also offline' });
});
