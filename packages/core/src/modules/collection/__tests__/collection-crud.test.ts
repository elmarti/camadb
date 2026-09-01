import { Cama } from '../../../index';
import { ICollection } from '../../../interfaces/collection.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';

interface Task {
  title: string;
  done: boolean;
  attempts: number;
}

describe('typed collection CRUD and identity semantics', () => {
  let collection: ICollection<Task>;

  beforeEach(async () => {
    const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
    collection = await database.initCollection<Task>('tasks', { columns: [], indexes: [] });
  });

  it('generates stable string identities and returns insert metadata', async () => {
    const one = await collection.insertOne({ title: 'one', done: false, attempts: 0 });
    const many = await collection.insertMany([
      { title: 'two', done: false, attempts: 0 },
      { _id: 'custom-id', title: 'three', done: true, attempts: 1 },
    ]);

    expect(one).toEqual({ acknowledged: true, insertedId: expect.any(String) });
    expect(many).toEqual({
      acknowledged: true,
      insertedCount: 2,
      insertedIds: [expect.any(String), 'custom-id'],
    });
    await expect(collection.findMany({ _id: one.insertedId })).resolves.toMatchObject({
      rows: [{ _id: one.insertedId, title: 'one', done: false, attempts: 0 }],
    });
  });

  it('rejects duplicate identities even when inserts overlap', async () => {
    const first = collection.insertOne({ _id: 'duplicate', title: 'one', done: false, attempts: 0 });
    const second = collection.insertOne({ _id: 'duplicate', title: 'two', done: false, attempts: 0 });

    await expect(first).resolves.toMatchObject({ insertedId: 'duplicate' });
    await expect(second).rejects.toThrow('Duplicate _id "duplicate"');
    await expect(collection.count()).resolves.toBe(1);
  });

  it('counts and deletes one or many matching documents', async () => {
    await collection.insertMany([
      { title: 'one', done: false, attempts: 0 },
      { title: 'two', done: false, attempts: 0 },
      { title: 'three', done: true, attempts: 0 },
    ]);

    await expect(collection.count({ done: false })).resolves.toBe(2);
    await expect(collection.deleteOne({ done: false })).resolves.toEqual({
      acknowledged: true,
      deletedCount: 1,
    });
    await expect(collection.deleteMany({ done: false })).resolves.toEqual({
      acknowledged: true,
      deletedCount: 1,
    });
    await expect(collection.count()).resolves.toBe(1);
  });

  it('reports update counts', async () => {
    await collection.insertMany([
      { title: 'one', done: false, attempts: 0 },
      { title: 'two', done: false, attempts: 0 },
    ]);

    await expect(collection.updateMany({ done: false }, { $set: { done: true } })).resolves.toEqual({
      acknowledged: true,
      matchedCount: 2,
      modifiedCount: 2,
      upsertedCount: 0,
    });
    await expect((collection as any).updateMany({}, { $set: { _id: 'replacement' } })).rejects.toThrow(
      'Document _id cannot be updated',
    );
  });

  it('updates a match or inserts a new document during upsert', async () => {
    const inserted = await collection.upsert(
      { title: 'missing' },
      { title: 'created', done: false, attempts: 0 },
    );
    expect(inserted).toEqual({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
      upsertedId: expect.any(String),
    });

    await expect(collection.upsert(
      { _id: inserted.upsertedId },
      { title: 'updated', done: true, attempts: 1 },
    )).resolves.toEqual({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
    });
    await expect(collection.findMany({ _id: inserted.upsertedId })).resolves.toMatchObject({
      rows: [{ _id: inserted.upsertedId, title: 'updated', done: true, attempts: 1 }],
    });
  });
});
