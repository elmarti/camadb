import { ICollectionConfig } from './collection-config.interface';

export interface IPersistenceAdapter {
  initCollection(name: string, config: ICollectionConfig):Promise<void> ;

  insert(ts: Array<any>): Promise<any>;
  getData():Promise<any>;

  update(indexes: void, delta: any):Promise<void>;

  destroy():Promise<void>;
}