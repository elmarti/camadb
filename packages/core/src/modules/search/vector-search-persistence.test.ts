import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import { IPersistenceAdapter, RecordMutation } from '../../interfaces/persistence-adapter.interface';
import { VectorSearchPersistence } from './vector-search-persistence';

class VectorAdapter implements IPersistenceAdapter {
  rows: any[] = [];
  getData = jest.fn(async (): Promise<any[]> => [...this.rows]);
  iterateRecords = jest.fn((): AsyncIterable<any> => this.iterate());
  getRecords = jest.fn(async (ids: string[]): Promise<Map<string, any>> => {
    const wanted = new Set(ids);
    return new Map(this.rows.filter((row) => wanted.has(row._id)).map((row) => [row._id, row]));
  });
  queryRecordIds = jest.fn(async (query: Record<string, unknown>): Promise<string[] | undefined> => {
    if (typeof query.category !== 'string') return undefined;
    return this.rows.filter((row) => row.category === query.category).map((row) => row._id);
  });

  async insert(rows: any[]): Promise<void> { await this.mutateRecords({ puts: rows }); }
  async update(rows: any[]): Promise<void> { this.rows = [...rows]; }
  async mutateRecords(mutation: RecordMutation): Promise<void> {
    const deletes = new Set(mutation.deletes ?? []);
    const puts = new Map((mutation.puts ?? []).map((row) => [row._id, row]));
    this.rows = this.rows.filter((row) => !deletes.has(row._id)).map((row) => puts.get(row._id) ?? row);
    for (const row of puts.values()) if (!this.rows.some((current) => current._id === row._id)) this.rows.push(row);
  }
  async destroy(): Promise<void> { this.rows = []; }

  private async *iterate(): AsyncIterable<any> { for (const row of this.rows) yield row; }
}

const metadata = (vectorIndexes?: Array<{ field: string; dimensions: number }>): ICollectionMeta => ({
  get: jest.fn().mockResolvedValue({ collectionName: 'records', columns: [], indexes: ['category'], vectorIndexes }),
  update: jest.fn().mockResolvedValue(undefined),
});

describe('vector search persistence', () => {
  it('scores cosine, dot-product, and Euclidean exact matches with stable ties', async () => {
    const adapter = new VectorAdapter();
    adapter.rows = [
      { _id: 'first', embedding: [1, 0] },
      { _id: 'second', embedding: [0.8, 0.2] },
      { _id: 'third', embedding: [-1, 0] },
      { _id: 'fourth', embedding: [0.8, 0.2] },
    ];
    const search = new VectorSearchPersistence(adapter, metadata([{ field: 'embedding', dimensions: 2 }]), []);

    await expect(search.searchVector('embedding', [1, 0], { metric: 'cosine', limit: 4 }))
      .resolves.toMatchObject([
        { document: { _id: 'first' }, score: 1 },
        { document: { _id: 'second' } },
        { document: { _id: 'fourth' } },
        { document: { _id: 'third' }, score: -1 },
      ]);
    await expect(search.searchVector('embedding', [2, 0], { metric: 'dot', limit: 1 }))
      .resolves.toMatchObject([{ document: { _id: 'first' }, score: 2 }]);
    await expect(search.searchVector('embedding', [0.8, 0.2], { metric: 'euclidean', limit: 2 }))
      .resolves.toEqual([
        { document: adapter.rows[1], score: 0 },
        { document: adapter.rows[3], score: 0 },
      ]);
  });

  it('uses metadata identities before loading and fully checks the remaining filter', async () => {
    const adapter = new VectorAdapter();
    adapter.rows = [
      { _id: 'first', category: 'keep', active: true, embedding: [1, 0] },
      { _id: 'second', category: 'drop', active: true, embedding: [1, 0] },
      { _id: 'third', category: 'keep', active: false, embedding: [0.9, 0.1] },
    ];
    const search = new VectorSearchPersistence(adapter, metadata([{ field: 'embedding', dimensions: 2 }]), []);

    await expect(search.searchVector('embedding', [1, 0], {
      filter: { category: 'keep', active: true },
      limit: 10,
    })).resolves.toMatchObject([{ document: { _id: 'first' } }]);
    expect(adapter.queryRecordIds).toHaveBeenCalled();
    expect(adapter.getRecords).toHaveBeenCalledWith(['first', 'third']);
    expect(adapter.iterateRecords).not.toHaveBeenCalled();
    expect(adapter.getData).not.toHaveBeenCalled();
  });

  it('rejects invalid dimensions and vectors before committing them', async () => {
    const adapter = new VectorAdapter();
    const search = new VectorSearchPersistence(adapter, metadata([{ field: 'embedding', dimensions: 3 }]), []);

    await expect(search.searchVector('embedding', [1, 2])).rejects.toThrow('dimension 2; expected 3');
    await expect(search.searchVector('missing', [1, 2, 3])).rejects.toThrow('is not configured');
    await expect(search.searchVector('embedding', [0, 0, 0])).rejects.toThrow('non-zero magnitude');
    await expect(search.insert([{ _id: 'bad', embedding: [1, Number.NaN, 3] }]))
      .rejects.toThrow('finite numbers');
    expect(adapter.rows).toEqual([]);
  });

  it('persists definitions added to existing collection metadata and validates configuration', async () => {
    const collectionMeta = metadata(undefined);
    const search = new VectorSearchPersistence(
      new VectorAdapter(), collectionMeta, [{ field: 'embedding', dimensions: 2 }],
    );
    await search.searchVector('embedding', [1, 0]);
    expect(collectionMeta.update).toHaveBeenCalledWith(
      'records', expect.objectContaining({ vectorIndexes: [{ field: 'embedding', dimensions: 2 }] }),
    );

    const invalid = new VectorSearchPersistence(
      new VectorAdapter(), metadata([{ field: 'embedding', dimensions: 0 }]), [],
    );
    await expect(invalid.searchVector('embedding', [])).rejects.toThrow('positive integer');
  });
});
