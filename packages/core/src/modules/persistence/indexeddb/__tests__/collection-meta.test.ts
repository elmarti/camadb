import { CollectionMeta } from '../collection-meta';

describe('IndexedDB collection metadata', () => {
  it('persists index definitions across collection instances', async () => {
    const database = `metadata-${Date.now()}-${Math.random()}`;
    const first = new CollectionMeta(
      { persistenceAdapter: 'indexeddb', path: database },
      { columns: [], indexes: ['group'], searchIndexes: ['body'] },
      'records',
    );
    await expect(first.get()).resolves.toMatchObject({ indexes: ['group'], searchIndexes: ['body'] });

    const reopened = new CollectionMeta(
      { persistenceAdapter: 'indexeddb', path: database },
      { columns: [], indexes: ['ignored'], searchIndexes: ['ignored'] },
      'records',
    );
    await expect(reopened.get()).resolves.toMatchObject({ indexes: ['group'], searchIndexes: ['body'] });
  });
});
