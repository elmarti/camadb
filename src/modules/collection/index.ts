import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';
import { IQueryOptions } from '../../interfaces/query-options.interface';

@injectable()
export class Collection  implements ICollection   {


  private config?: ICollectionConfig;
  private name?: string;
  constructor(
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
    @inject(TYPES.QueryService) private queryService: IQueryService<any>) {
  }

  /**
   * Initialises the collection
   *
   * @private
   * @remarks Internal method - don't call it
   * @param name - The name of the collection
   * @param config - The collection config
   */
  async init(name: string, config: ICollectionConfig): Promise<void> {
    this.name = name;
    this.config = config;
    await this.persistenceAdapter.initCollection(name, config);
  }

  /**
   * Insert many values into collection
   * @param rows - The values to be inserted
   */
  async insertMany(rows:Array<any>):Promise<void> {
    return this.persistenceAdapter.insert(rows);
  }

  /**
   * Inserts 1 value into collection
   *
   * @remarks
   * Essentially syntactic sugar - internally calls the same function as `insertMany`
   * @param row
   */
  async insertOne(row: any):Promise<void> {
    return this.persistenceAdapter.insert([row]);
  }

  /**
   * Find many rows from the collection
   *
   * @remarks
   * Lazily loads collection into cache, subsequent calls are significantly faster
   *
   * @param query - Query Object
   * @param options - Query options
   */
  async findMany<T>(query: any, options:IQueryOptions): Promise<Array<T>> {
    return await this.queryService.filter(query, options);
  }

}