import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';

export interface IQueryService<T> {
  filter(query:any, options?: IQueryOptions):Promise<IFilterResult<T>>;
  update(query: any, delta: any): Promise<void>;
}