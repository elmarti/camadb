import { ICollectionConfig } from './collection-config.interface';
import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';

export interface ICollection  {
  init(collectionName: string, config: ICollectionConfig): Promise<void>;
  insertMany<T>(rows: Array<T>): Promise<void>;
  insertOne<T>(row: T): Promise<void>;
  findMany<T>(query: any, options?:IQueryOptions):Promise<IFilterResult<T>>;
  updateMany<T>(query:any, delta:any): Promise<void>;

}
