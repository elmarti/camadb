import { IQueryOptions } from './query-options.interface';

export interface IQueryService<T> {
  filter(query:any, options: IQueryOptions):Promise<T>;

  retrieveIndexes(query: any): Promise<void>;
}