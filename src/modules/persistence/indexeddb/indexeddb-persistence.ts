import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';

export default class IndexedDbPersistence implements IPersistenceAdapter{
  getData(): Promise<any> {
    return Promise.resolve(undefined);
  }
  insert(ts: Array<any>): Promise<any> {
    return Promise.resolve(undefined);
  }
  initCollection(name: string, config: ICollectionConfig): Promise<void> {
    return Promise.resolve(undefined);
  }

}
