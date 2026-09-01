import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';
import { Filter, Update } from './document-types';

export interface IQueryService<T extends object> {
  filter(query: Filter<T>, options?: IQueryOptions<T>):Promise<IFilterResult<T>>;
  update(query: Filter<T>, delta: Update<T>): Promise<void>;
}
