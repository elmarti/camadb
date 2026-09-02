import { promises as nodeFs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Cama } from '../../../..';
import { IPersistenceAdapter } from '../../../../interfaces/persistence-adapter.interface';
import { PersistenceAdapterEnum } from '../../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../../types';

interface TestDocument {
  value: string;
}

describe('filesystem record persistence', () => {
  let databasePath: string;

  beforeEach(async () => {
    databasePath = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-records-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await nodeFs.rm(databasePath, { recursive: true, force: true });
  });

  it('writes bounded immutable pages and compacts unreachable generations', async () => {
    const collection = await createCollection();
    await collection.insertMany(
      Array.from({ length: 1_200 }, (_, index) => ({ _id: String(index), value: `row-${index}` })),
    );
    const pagesPath = path.join(databasePath, 'records', 'pages');
    expect(await nodeFs.readdir(pagesPath)).toHaveLength(3);

    await collection.updateMany({ _id: '600' }, { $set: { value: 'updated' } });
    expect(await nodeFs.readdir(pagesPath)).toHaveLength(4);

    const adapter = collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    await adapter?.compact?.();
    expect(await nodeFs.readdir(pagesPath)).toHaveLength(3);
    await expect(collection.findMany({ _id: '600' })).resolves.toMatchObject({
      rows: [{ _id: '600', value: 'updated' }],
    });
  });

  it('keeps the previous generation readable when manifest publication is interrupted', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'before' });
    const realRename = nodeFs.rename.bind(nodeFs);
    let interrupted = false;
    jest.spyOn(nodeFs, 'rename').mockImplementation(async (source, destination) => {
      if (!interrupted && String(destination).endsWith('manifest.json')) {
        interrupted = true;
        throw new Error('simulated manifest interruption');
      }
      await realRename(source, destination);
    });

    await expect(collection.updateMany({ _id: 'record' }, { $set: { value: 'interrupted' } })).rejects.toThrow(
      'simulated manifest interruption',
    );
    await expect(collection.findMany({ _id: 'record' })).resolves.toMatchObject({
      rows: [{ _id: 'record', value: 'before' }],
    });

    await expect(collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } })).resolves.toMatchObject({
      modifiedCount: 1,
    });
  });

  it('retains a valid generation when physical compaction cleanup fails', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'before' });
    await collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } });
    const adapter = collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    jest.spyOn(nodeFs, 'rm').mockRejectedValueOnce(new Error('simulated cleanup interruption'));

    await expect(adapter?.compact?.()).rejects.toThrow('simulated cleanup interruption');
    await expect(collection.findMany({ _id: 'record' })).resolves.toMatchObject({
      rows: [{ _id: 'record', value: 'after' }],
    });
  });

  async function createCollection() {
    const database = new Cama({ path: databasePath, persistenceAdapter: PersistenceAdapterEnum.FS });
    return database.initCollection<TestDocument>('records', { columns: [], indexes: [] });
  }

  it('keeps old pages until an active iterator releases its snapshot', async () => {
    const collection = await createCollection();
    await collection.insertMany(Array.from({ length: 513 }, (_, index) => ({ _id: String(index), value: 'old' })));
    const adapter = collection.container!.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    const iterator = adapter.iterateRecords!()[Symbol.asyncIterator]();
    await iterator.next();
    await collection.updateMany({ _id: '512' }, { $set: { value: 'new' } });
    await collection.compact();
    let last;
    for (let index = 1; index < 513; index += 1) last = (await iterator.next()).value;
    expect(last).toEqual({ _id: '512', value: 'old' });
    await iterator.return?.();
    await collection.compact();
    expect((await collection.storageStats()).reclaimableBytes).toBe(0);
  });

  it('does not report a committed mutation as failed when automatic cleanup fails', async () => {
    const database = new Cama({
      path: databasePath,
      persistenceAdapter: PersistenceAdapterEnum.FS,
      compaction: { minReclaimableBytes: 0, minReclaimableRatio: 0 },
    });
    const collection = await database.initCollection<TestDocument>('records', { columns: [], indexes: [] });
    await collection.insertOne({ _id: 'record', value: 'before' });
    jest.spyOn(nodeFs, 'rm').mockRejectedValueOnce(new Error('automatic cleanup interrupted'));
    await expect(collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } })).resolves.toMatchObject({
      modifiedCount: 1,
    });
    expect((await collection.storageStats()).lastCompactionError).toBe('automatic cleanup interrupted');
    await collection.compact();
    expect((await collection.storageStats()).lastCompactionError).toBeUndefined();
    expect((await collection.findMany({ _id: 'record' })).rows[0].value).toBe('after');
  });

  it('does not scan whole-store statistics for ordinary point writes below the byte threshold', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'before' });
    const adapter = collection.container!.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    const statistics = jest.spyOn(adapter, 'storageStats');
    await collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } });
    expect(statistics).not.toHaveBeenCalled();
  });

  it('compacts more records than fit in one mutation batch', async () => {
    const collection = await createCollection();
    await collection.insertMany(
      Array.from({ length: 10_000 }, (_, index) => ({ _id: String(index), value: 'record' })),
    );
    await collection.insertOne({ _id: 'last', value: 'record' });
    await collection.compact();
    expect(await collection.count()).toBe(10_001);
    expect((await collection.storageStats()).reclaimableBytes).toBe(0);
  }, 30_000);
});
