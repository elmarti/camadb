import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';
import { Filter, Update } from './document-types';
import { DeleteResult, UpdateResult } from './mutation-result.interface';

export interface IQueryService<T extends object> {
  filter(query: Filter<T>, options?: IQueryOptions<T>):Promise<IFilterResult<T>>;
  update(query: Filter<T>, delta: Update<T>): Promise<UpdateResult>;
  delete(query: Filter<T>, limit?: number): Promise<DeleteResult>;
  count(query?: Filter<T>): Promise<number>;
}
