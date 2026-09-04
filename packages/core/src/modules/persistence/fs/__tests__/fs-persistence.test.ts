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

// Real durable writes and compaction can exceed Jest's default on shared CI disks.
// This is a correctness-test deadline, not a performance benchmark threshold.
const DURABLE_COMPACTION_TIMEOUT_MS = 30_000;

describe('filesystem record persistence', () => {
  let databasePath: string;

  beforeEach(async () => {
    databasePath = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-records-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await nodeFs.rm(databasePath, { recursive: true, force: true });
  });

  it('writes a committed segment and compacts unreachable frames', async () => {
    const collection = await createCollection();
    await collection.insertMany(
      Array.from({ length: 1_200 }, (_, index) => ({ _id: String(index), value: `row-${index}` })),
    );
    const segmentPath = path.join(databasePath, 'records', 'records.segment');
    const insertedBytes = (await nodeFs.stat(segmentPath)).size;

    await collection.updateMany({ _id: '600' }, { $set: { value: 'updated' } });
    const staleStats = await collection.storageStats();
    expect(staleStats.reclaimableBytes).toBeGreaterThan(0);

    const adapter = collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    await adapter?.compact?.();
    expect((await collection.storageStats()).reclaimableBytes).toBe(0);
    expect((await nodeFs.stat(segmentPath)).size).toBeLessThan(insertedBytes + 10_000);
    await expect(collection.findMany({ _id: '600' })).resolves.toMatchObject({
      rows: [{ _id: '600', value: 'updated' }],
    });
  }, DURABLE_COMPACTION_TIMEOUT_MS);

  it('keeps the previous generation readable when a segment write is interrupted', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'before' });
    jest.spyOn(nodeFs, 'open').mockRejectedValueOnce(new Error('simulated segment interruption'));

    await expect(collection.updateMany({ _id: 'record' }, { $set: { value: 'interrupted' } })).rejects.toThrow(
      'simulated segment interruption',
    );
    await expect(collection.findMany({ _id: 'record' })).resolves.toMatchObject({
      rows: [{ _id: 'record', value: 'before' }],
    });

    await expect(collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } })).resolves.toMatchObject({
      modifiedCount: 1,
    });
  });

  it('recovers the last checksummed commit and truncates invalid tails', async () => {
    const collection = await createCollection();
    await collection.insertMany([
      { _id: 'one', value: 'first' },
      { _id: 'two', value: 'second' },
    ]);
    const segmentPath = path.join(databasePath, 'records', 'records.segment');
    const committedSize = (await nodeFs.stat(segmentPath)).size;

    await nodeFs.appendFile(segmentPath, Buffer.alloc(12, 0xff));
    await expect((await createCollection()).count()).resolves.toBe(2);
    expect((await nodeFs.stat(segmentPath)).size).toBe(committedSize);

    const corruptTrailer = Buffer.alloc(24);
    Buffer.from('CAMATRL3').copy(corruptTrailer);
    corruptTrailer.writeBigUInt64BE(BigInt(committedSize), 8);
    corruptTrailer.writeUInt32BE(64, 16);
    corruptTrailer.writeUInt32BE(0xdeadbeef, 20);
    await nodeFs.appendFile(segmentPath, corruptTrailer);

    const recovered = await createCollection();
    await expect(recovered.findMany({ _id: 'two' })).resolves.toMatchObject({
      rows: [{ _id: 'two', value: 'second' }],
    });
    expect((await nodeFs.stat(segmentPath)).size).toBe(committedSize);
  });

  it('bounds recovery replay with periodic locator checkpoints', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'initial' });
    for (let index = 0; index < 260; index += 1) {
      await collection.updateMany({ _id: 'record' }, { $set: { value: `revision-${index}` } });
    }

    const reopened = await createCollection();
    await expect(reopened.findMany({ _id: 'record' })).resolves.toMatchObject({
      rows: [{ _id: 'record', value: 'revision-259' }],
    });
  }, DURABLE_COMPACTION_TIMEOUT_MS);

  it('retains a valid generation when physical compaction cleanup fails', async () => {
    const collection = await createCollection();
    await collection.insertOne({ _id: 'record', value: 'before' });
    await collection.updateMany({ _id: 'record' }, { $set: { value: 'after' } });
    const adapter = collection.container?.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    jest.spyOn(nodeFs, 'rename').mockRejectedValueOnce(new Error('simulated compaction interruption'));

    await expect(adapter?.compact?.()).rejects.toThrow('simulated compaction interruption');
    await expect(collection.findMany({ _id: 'record' })).resolves.toMatchObject({
      rows: [{ _id: 'record', value: 'after' }],
    });
  });

  async function createCollection() {
    const database = new Cama({ path: databasePath, persistenceAdapter: PersistenceAdapterEnum.FS });
    return database.initCollection<TestDocument>('records', { columns: [], indexes: [] });
  }

  it('keeps old frames until an active iterator releases its snapshot', async () => {
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
  }, DURABLE_COMPACTION_TIMEOUT_MS);

  it('does not report a committed mutation as failed when automatic cleanup fails', async () => {
    const database = new Cama({
      path: databasePath,
      persistenceAdapter: PersistenceAdapterEnum.FS,
      compaction: { minReclaimableBytes: 0, minReclaimableRatio: 0 },
    });
    const collection = await database.initCollection<TestDocument>('records', { columns: [], indexes: [] });
    await collection.insertOne({ _id: 'record', value: 'before' });
    jest.spyOn(nodeFs, 'rename').mockRejectedValueOnce(new Error('automatic cleanup interrupted'));
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
  }, DURABLE_COMPACTION_TIMEOUT_MS);
});
