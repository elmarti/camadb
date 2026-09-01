import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';
import { ServiceRegistry } from '../util/service-registry';
import { AggregationPipeline, Document, Filter, Update } from './document-types';

export interface ICollection<TDocument extends object = Document> {
  container?: ServiceRegistry;
  insertMany(rows: TDocument[]): Promise<void>;
  insertOne(row: TDocument): Promise<void>;
  findMany(query?: Filter<TDocument>, options?:IQueryOptions<TDocument>):Promise<IFilterResult<TDocument>>;
  updateMany(query: Filter<TDocument>, delta: Update<TDocument>): Promise<void>;
  destroy():Promise<void>;
  aggregate<TResult extends object = TDocument>(pipeline: AggregationPipeline<TDocument>): Promise<TResult[]>;

}
