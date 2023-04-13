// cama.test.ts

import { Cama, Collection } from '../';
import { ICamaConfig } from '../interfaces/cama-config.interface';
import { PersistenceAdapterEnum } from '../interfaces/perisistence-adapter.enum';

describe('Cama', () => {
  const camaConfig: ICamaConfig = {
    persistenceAdapter: PersistenceAdapterEnum.InMemory,
    path: 'test-db',
  };



  it('should initialize a collection', async () => {
    const cama = new Cama(camaConfig);
    const collectionName = 'testCollection';
    const collectionConfig = {
      columns: [],
      indexes: []
    };

    const collection = await cama.initCollection(collectionName, collectionConfig);
    expect(collection).toBeDefined();
    expect(collection).toBeInstanceOf(Collection);
  });
});
