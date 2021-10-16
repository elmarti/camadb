import { ICollectionConfig } from './collection-config.interface';

export interface IPersistenceAdapter {

  insert(ts: Array<any>): Promise<any>;
  getData():Promise<any>;

  update(updated:any):Promise<void>;

  destroy():Promise<void>;
}