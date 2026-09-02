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
});
