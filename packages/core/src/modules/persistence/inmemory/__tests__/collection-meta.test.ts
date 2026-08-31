import { CollectionMeta } from '../collection-meta';

describe('CollectionMeta', () => {
  let collectionMeta: CollectionMeta;

  beforeEach(() => {
    collectionMeta = new CollectionMeta();
  });

  it('should create an instance of CollectionMeta', () => {
    expect(collectionMeta).toBeInstanceOf(CollectionMeta);
  });

  it('should return undefined on calling init', async () => {
    const metaStructure = { collectionName: 'test', columns: [], indexes: [] };

    expect(await collectionMeta.init('test', metaStructure)).toBeUndefined();
  });

  it('should return undefined when no meta data is set', async () => {
    expect(await collectionMeta.get()).toBeUndefined();
  });

  it('should update the meta value', async () => {
    const metaStructure = { collectionName: 'test', columns: [], indexes: [] };
    await collectionMeta.update('test', metaStructure);
    expect(await collectionMeta.get()).toBeUndefined()
  });
});
