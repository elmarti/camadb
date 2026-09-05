import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { IPersistenceAdapter, RecordMutation } from '../../../interfaces/persistence-adapter.interface';
import { MetadataIndexedPersistence } from '../metadata-indexed-persistence';

class RevisionAdapter implements IPersistenceAdapter {
  rows: any[] = [];
  revision = 0;

  async insert(rows: any[]): Promise<void> {
    await this.mutateRecords({ puts: rows });
  }
  async update(rows: any[]): Promise<void> {
    this.rows = [...rows];
    this.revision += 1;
  }
  async getData(): Promise<any[]> { return [...this.rows]; }
  async getRecord(id: string): Promise<any | undefined> { return this.rows.find((row) => row._id === id); }
  async getRecords(ids: string[]): Promise<Map<string, any>> {
    const wanted = new Set(ids);
    return new Map(this.rows.filter((row) => wanted.has(row._id)).map((row) => [row._id, row]));
  }
  async *iterateRecords(): AsyncIterable<any> { for (const row of this.rows) yield row; }
  async mutateRecords(mutation: RecordMutation): Promise<void> {
    const deletes = new Set(mutation.deletes ?? []);
    const puts = new Map((mutation.puts ?? []).map((row) => [row._id, row]));
    this.rows = this.rows.filter((row) => !deletes.has(row._id)).map((row) => puts.get(row._id) ?? row);
    for (const row of puts.values()) if (!this.rows.some((current) => current._id === row._id)) this.rows.push(row);
    this.revision += 1;
  }
  async cacheRevision(): Promise<string> { return String(this.revision); }
  async destroy(): Promise<void> { this.rows = []; this.revision += 1; }
}

const metadata = (indexes: string[]): ICollectionMeta => ({
  get: jest.fn().mockResolvedValue({ collectionName: 'records', columns: [], indexes }),
  update: jest.fn(),
});

describe('metadata indexed persistence', () => {
  it('narrows equality, range, and implicit intersection queries in storage order', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'first', group: 'a', score: 10 },
      { _id: 'second', group: 'b', score: 20 },
      { _id: 'third', group: 'a', score: 30 },
    ];
    const indexed = new MetadataIndexedPersistence(adapter, metadata(['group', 'score']), []);

    await expect(indexed.queryRecords({ group: 'a' })).resolves.toEqual([adapter.rows[0], adapter.rows[2]]);
    await expect(indexed.queryRecords({ score: { $gte: 20, $lt: 31 } })).resolves.toEqual([
      adapter.rows[1],
      adapter.rows[2],
    ]);
    await expect(indexed.queryRecords({ group: 'a', score: { $gt: 10, $lte: 30 } })).resolves.toEqual([
      adapter.rows[2],
    ]);
    await expect(indexed.queryRecords({ missing: 'value' })).resolves.toBeUndefined();
  });

  it('maintains indexes after writes and rebuilds after an external revision', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [{ _id: 'first', group: 'a', score: 10 }];
    const indexed = new MetadataIndexedPersistence(adapter, metadata(['group', 'score']), []);
    await indexed.queryRecords({ group: 'a' });

    await indexed.mutateRecords({ puts: [{ _id: 'first', group: 'b', score: 20 }] });
    await expect(indexed.queryRecords({ group: 'a' })).resolves.toEqual([]);
    await expect(indexed.queryRecords({ group: 'b' })).resolves.toEqual([adapter.rows[0]]);

    await indexed.insert([{ _id: 'second', group: 'b', score: 30 }]);
    await expect(indexed.queryRecords({ score: { $gte: 20 } })).resolves.toEqual(adapter.rows);
    await indexed.mutateRecords({ deletes: ['first'] });
    await expect(indexed.queryRecords({ group: 'b' })).resolves.toEqual([adapter.rows[0]]);

    await adapter.insert([{ _id: 'external', group: 'c', score: 40 }]);
    await expect(indexed.queryRecords({ group: 'c' })).resolves.toEqual([adapter.rows[1]]);
  });

  it('preserves storage order on replacement and does not advance after a failed write', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'first', group: 'a' },
      { _id: 'second', group: 'a' },
    ];
    const indexed = new MetadataIndexedPersistence(adapter, metadata(['group']), []);
    await indexed.queryRecords({ group: 'a' });

    await indexed.mutateRecords({ puts: [{ _id: 'first', group: 'a', changed: true }] });
    await expect(indexed.queryRecords({ group: 'a' })).resolves.toEqual(adapter.rows);

    jest.spyOn(adapter, 'mutateRecords').mockRejectedValueOnce(new Error('simulated storage failure'));
    await expect(indexed.mutateRecords({ puts: [{ _id: 'second', group: 'b' }] })).rejects.toThrow(
      'simulated storage failure',
    );
    await expect(indexed.queryRecords({ group: 'a' })).resolves.toEqual(adapter.rows);
    await expect(indexed.queryRecords({ group: 'b' })).resolves.toEqual([]);
  });

  it('retains scan semantics for mixed-type range comparisons', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'number', score: 10 },
      { _id: 'string', score: '20' },
    ];
    const indexed = new MetadataIndexedPersistence(adapter, metadata(['score']), []);
    await indexed.queryRecords({ score: 10 });
    await expect(indexed.queryRecords({ score: { $gte: 10 } })).resolves.toBeUndefined();
  });

  it('falls back to configured definitions when metadata is unavailable', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [{ _id: 'first', group: 'a' }];
    const unavailable: ICollectionMeta = { get: jest.fn().mockResolvedValue(undefined), update: jest.fn() };
    const indexed = new MetadataIndexedPersistence(adapter, unavailable, ['group']);
    await expect(indexed.queryRecords({ group: 'a' })).resolves.toEqual(adapter.rows);
  });
});
