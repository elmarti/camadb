import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { deleteDB } from 'idb';
import { Cama, Collection, CacheMode, ICollectionConfig } from '../../..';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { Fs } from '../fs/fs';
import { IndexedDbDatabaseCoordinator } from '../indexeddb/database-coordinator';

const config = { columns: [], indexes: [] };
for (const adapter of ['fs', 'indexeddb'] as const) {
  describe(`${adapter} collection lifecycle contracts`, () => {
    let root: string;
    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(tmpdir(), 'cama-contract-'));
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      if (adapter === 'indexeddb') await deleteDB(root);
      await fs.rm(root, { recursive: true, force: true });
    });
    test.each<CacheMode>(['disabled', 'lazy', 'lru', 'eager'])(
      'empty collection is discoverable after %s initialization',
      async (mode) => {
        const db = new Cama({ persistenceAdapter: adapter, path: root, cache: { mode } });
        await db.initCollection('empty', config);
        expect(await db.collectionExists('empty')).toBe(true);
        expect(await db.describeCollection('empty')).toEqual({ name: 'empty', ...config });
        expect((await db.listCollections()).collections.map((c) => c.name)).toEqual(['empty']);
      },
    );
    test('invalid names fail before creating adapter storage through either public entry point', async () => {
      const options = { persistenceAdapter: adapter, path: root };
      const db = new Cama(options);
      for (const name of ['', '.', '..', '../escape', 'nested/name', 'nested\\name', '\0', 'x'.repeat(256)]) {
        await expect(db.initCollection(name, config)).rejects.toThrow('collection name');
        expect(() => new Collection(name, config, options)).toThrow('collection name');
      }
      expect(await fs.readdir(root)).toEqual([]);
      expect((await indexedDB.databases()).some((d) => d.name === root)).toBe(false);
    });
    test('metadata outside catalogue bounds is rejected before persistence', async () => {
      const db = new Cama({ persistenceAdapter: adapter, path: root });
      const invalid: ICollectionConfig[] = [
        { columns: [{ title: 'x'.repeat(256), type: 'text' }], indexes: [] },
        { columns: [{ title: 'x', type: 'x'.repeat(101) }], indexes: [] },
        { columns: Array.from({ length: 1001 }, () => ({ title: 'x', type: 'text' })), indexes: [] },
        { columns: [], indexes: ['x'.repeat(256)] },
        { columns: [], indexes: Array(1001).fill('x') },
        { columns: Array.from({ length: 1000 }, () => ({ title: 'x'.repeat(255), type: 'text' })), indexes: [] },
      ];
      for (const metadata of invalid) await expect(db.initCollection('invalid', metadata)).rejects.toThrow(/metadata/);
      expect(await fs.readdir(root)).toEqual([]);
      expect((await indexedDB.databases()).some((d) => d.name === root)).toBe(false);
    });
    test('invalid metadata update leaves existing metadata and documents intact', async () => {
      const db = new Cama({ persistenceAdapter: adapter, path: root });
      const collection = await db.initCollection('healthy', config);
      await collection.insertOne({ _id: 'one', value: 'preserve' });
      const meta = collection.container.get<ICollectionMeta>(TYPES.CollectionMeta);
      await expect(meta.update('renamed', { collectionName: 'renamed', ...config })).rejects.toThrow('cannot rename');
      await expect(
        meta.update('healthy', {
          collectionName: 'healthy',
          columns: [{ title: 'x'.repeat(256), type: 'text' }],
          indexes: [],
        }),
      ).rejects.toThrow('metadata');
      expect(await db.describeCollection('healthy')).toEqual({ name: 'healthy', ...config });
      expect((await collection.findMany({})).rows).toEqual([{ _id: 'one', value: 'preserve' }]);
    });
  });
}

test('filesystem metadata initialization failures reach the caller without writing record data', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'cama-init-failure-'));
  const write = Fs.prototype.writeJSON;
  const spy = jest.spyOn(Fs.prototype, 'writeJSON').mockImplementation(async function (
    this: Fs,
    directory,
    name,
    value,
  ) {
    if (name === 'meta.json') throw new Error('Injected metadata write failure');
    return write.call(this, directory, name, value);
  });
  try {
    const db = new Cama({ persistenceAdapter: 'fs', path: root });
    await expect(db.initCollection('failed', config)).rejects.toThrow('Injected metadata write failure');
    await expect(fs.stat(path.join(root, 'failed', 'records.segment'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await db.collectionExists('failed')).toBe(false);
  } finally {
    spy.mockRestore();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('existing metadata outside the catalogue contract is refused without rewriting it', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'cama-invalid-existing-'));
  try {
    const directory = path.join(root, 'existing');
    await fs.mkdir(directory);
    const raw = JSON.stringify({
      collectionName: 'existing',
      columns: [{ title: 'x'.repeat(256), type: 'text' }],
      indexes: [],
    });
    await fs.writeFile(path.join(directory, 'meta.json'), raw);
    const db = new Cama({ persistenceAdapter: 'fs', path: root });
    await expect(db.initCollection('existing', config)).rejects.toThrow('metadata');
    expect(await fs.readFile(path.join(directory, 'meta.json'), 'utf8')).toBe(raw);
    expect(await fs.readdir(directory)).toEqual(['meta.json']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('IndexedDB initialization failures are reported and a new initialization can recover', async () => {
  const location = `cama-init-failure-${Date.now()}`;
  const spy = jest
    .spyOn(IndexedDbDatabaseCoordinator, 'run')
    .mockRejectedValueOnce(new Error('Injected IndexedDB failure'));
  try {
    const db = new Cama({ persistenceAdapter: 'indexeddb', path: location });
    await expect(db.initCollection('failed', config)).rejects.toThrow('Injected IndexedDB failure');
    expect(await db.collectionExists('failed')).toBe(false);
    spy.mockRestore();
    await db.initCollection('failed', config);
    expect(await db.collectionExists('failed')).toBe(true);
  } finally {
    spy.mockRestore();
    await deleteDB(location);
  }
});
