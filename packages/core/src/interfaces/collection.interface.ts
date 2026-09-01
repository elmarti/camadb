import { IQueryOptions } from './query-options.interface';
import { IFilterResult } from './filter-result.interface';
import { ServiceRegistry } from '../util/service-registry';
import { AggregationPipeline, Document, DocumentId, Filter, InsertDocument, StoredDocument, Update } from './document-types';
import { DeleteResult, InsertManyResult, InsertOneResult, UpdateResult } from './mutation-result.interface';

export interface ICollection<TDocument extends object = Document> {
  container?: ServiceRegistry;
  insertMany(rows: InsertDocument<TDocument>[]): Promise<InsertManyResult<DocumentId>>;
  insertOne(row: InsertDocument<TDocument>): Promise<InsertOneResult<DocumentId>>;
  findMany(query?: Filter<StoredDocument<TDocument>>, options?:IQueryOptions<StoredDocument<TDocument>>):Promise<IFilterResult<StoredDocument<TDocument>>>;
  updateMany(query: Filter<StoredDocument<TDocument>>, delta: Update<Omit<TDocument, '_id'>>): Promise<UpdateResult<DocumentId>>;
  deleteOne(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult>;
  deleteMany(query: Filter<StoredDocument<TDocument>>): Promise<DeleteResult>;
  count(query?: Filter<StoredDocument<TDocument>>): Promise<number>;
  upsert(query: Filter<StoredDocument<TDocument>>, document: InsertDocument<TDocument>): Promise<UpdateResult<DocumentId>>;
  destroy():Promise<void>;
  aggregate<TResult extends object = StoredDocument<TDocument>>(pipeline: AggregationPipeline<StoredDocument<TDocument>>): Promise<TResult[]>;

}
