import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import { IPersistenceAdapter, RecordMutation } from '../../interfaces/persistence-adapter.interface';
import { FullTextIndexedPersistence, tokenizeText } from './full-text-indexed-persistence';

class RevisionAdapter implements IPersistenceAdapter {
  rows: any[] = [];
  revision = 0;

  async insert(rows: any[]): Promise<void> { await this.mutateRecords({ puts: rows }); }
  async update(rows: any[]): Promise<void> { this.rows = [...rows]; this.revision += 1; }
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
  async queryRecords(query: Record<string, unknown>): Promise<any[] | undefined> {
    if (typeof query.category !== 'string') return undefined;
    return this.rows.filter((row) => row.category === query.category);
  }
  async queryRecordIds(query: Record<string, unknown>): Promise<string[] | undefined> {
    const rows = await this.queryRecords(query);
    return rows?.map((row) => row._id);
  }
  async cacheRevision(): Promise<string> { return String(this.revision); }
  async destroy(): Promise<void> { this.rows = []; this.revision += 1; }
}

const metadata = (searchIndexes?: string[]): ICollectionMeta => ({
  get: jest.fn().mockResolvedValue({ collectionName: 'records', columns: [], indexes: [], searchIndexes }),
  update: jest.fn().mockResolvedValue(undefined),
});

describe('full-text indexed persistence', () => {
  it('normalizes Unicode and ranks BM25 results with stable ties', async () => {
    expect(tokenizeText('Ｃafé, CAFÉ!')).toEqual(['café', 'café']);
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'first', body: 'cobalt harbor local record' },
      { _id: 'second', body: 'cobalt cobalt harbor record' },
      { _id: 'third', body: 'cobalt local durable record' },
    ];
    const indexed = new FullTextIndexedPersistence(adapter, metadata(['body']), []);

    const any = await indexed.searchText('cobalt harbor', { limit: 10 });
    expect(any.map((hit) => hit.document._id)).toEqual(['second', 'first', 'third']);
    expect(any[0]).toMatchObject({ matchedTerms: ['cobalt', 'harbor'], score: expect.any(Number) });
    await expect(indexed.searchText('cobalt harbor', { match: 'all', limit: 10 })).resolves.toMatchObject([
      { document: { _id: 'second' } },
      { document: { _id: 'first' } },
    ]);
    await expect(indexed.searchText('---')).resolves.toEqual([]);
  });

  it('applies metadata candidates before scoring and supports pagination', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'first', body: 'cobalt harbor', category: 'keep' },
      { _id: 'second', body: 'cobalt cobalt harbor', category: 'drop' },
      { _id: 'third', body: 'cobalt harbor', category: 'keep' },
    ];
    const indexed = new FullTextIndexedPersistence(adapter, metadata(['body']), []);
    await expect(indexed.searchText('cobalt harbor', {
      filter: { category: 'keep' },
      limit: 1,
      offset: 1,
    })).resolves.toMatchObject([{ document: { _id: 'third' } }]);
  });

  it('maintains committed writes, preserves order, and rebuilds after external changes', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [
      { _id: 'first', body: 'old term' },
      { _id: 'second', body: 'stable term' },
    ];
    const indexed = new FullTextIndexedPersistence(adapter, metadata(['body']), []);
    await indexed.searchText('term');

    await indexed.mutateRecords({ puts: [{ _id: 'first', body: 'stable term' }] });
    await expect(indexed.searchText('stable', { limit: 10 })).resolves.toMatchObject([
      { document: { _id: 'first' } },
      { document: { _id: 'second' } },
    ]);
    await indexed.mutateRecords({ deletes: ['first'] });
    await expect(indexed.searchText('stable')).resolves.toMatchObject([{ document: { _id: 'second' } }]);

    await adapter.insert([{ _id: 'external', body: 'external revision' }]);
    await expect(indexed.searchText('external')).resolves.toMatchObject([{ document: { _id: 'external' } }]);
  });

  it('does not advance index state when storage rejects a mutation', async () => {
    const adapter = new RevisionAdapter();
    adapter.rows = [{ _id: 'first', body: 'committed value' }];
    const indexed = new FullTextIndexedPersistence(adapter, metadata(['body']), []);
    await indexed.searchText('committed');
    jest.spyOn(adapter, 'mutateRecords').mockRejectedValueOnce(new Error('simulated storage failure'));
    await expect(indexed.mutateRecords({ puts: [{ _id: 'first', body: 'uncommitted value' }] })).rejects.toThrow(
      'simulated storage failure',
    );
    await expect(indexed.searchText('committed')).resolves.toHaveLength(1);
    await expect(indexed.searchText('uncommitted')).resolves.toEqual([]);
  });

  it('persists newly configured definitions and validates options', async () => {
    const collectionMeta = metadata(undefined);
    const indexed = new FullTextIndexedPersistence(new RevisionAdapter(), collectionMeta, ['body']);
    await indexed.searchText('missing');
    expect(collectionMeta.update).toHaveBeenCalledWith('records', expect.objectContaining({ searchIndexes: ['body'] }));
    await expect(indexed.searchText('query', { limit: -1 })).rejects.toThrow('non-negative integer');

    const unavailable = new FullTextIndexedPersistence(new RevisionAdapter(), metadata([]), []);
    await expect(unavailable.searchText('query')).rejects.toThrow('requires at least one');
  });
});
