import { ICollectionConfig } from './collection-config.interface';

export interface ICollection  {
  init(collectionName: string, config: ICollectionConfig): Promise<void>;
  insertMany<T>(rows: Array<T>): Promise<void>;
  insertOne<T>(row: T): Promise<void>;
  findMany<T>(query: any):Promise<Array<T>>;

}
