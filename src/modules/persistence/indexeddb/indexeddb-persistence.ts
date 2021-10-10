import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';

export default class IndexedDbPersistence implements IPersistenceAdapter{
  destroy(): Promise<void> {
    return Promise.resolve(undefined);
  }
  update(indexes: void, delta: any): Promise<void> {
    return Promise.resolve(undefined);
  }
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
