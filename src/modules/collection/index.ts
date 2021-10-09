import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';
import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { IFilterResult } from '../../interfaces/filter-result.interface';

@injectable()
export class Collection  implements ICollection   {


  private config?: ICollectionConfig;
  private name?: string;
  constructor(
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
    @inject(TYPES.QueryService) private queryService: IQueryService<any>,
    @inject(TYPES.Logger) private logger:ILogger) {
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
    this.logger.log(LogLevel.Debug, 'Initializing collection');
    this.name = name;
    this.config = config;
    this.logger.log(LogLevel.Debug, 'Initializing persistence adapter');
    const pointer = this.logger.startTimer();
    await this.persistenceAdapter.initCollection(name, config);
    this.logger.endTimer(LogLevel.Perf, pointer, "init collection");
  }

  /**
   * Insert many values into collection
   * @param rows - The values to be inserted
   */
  async insertMany(rows:Array<any>):Promise<void> {
    this.logger.log(LogLevel.Debug, 'Inserting many');
    const pointer = this.logger.startTimer();
    await this.persistenceAdapter.insert(rows);
    this.logger.endTimer(LogLevel.Perf, pointer, "insert  rows");
  }

  /**
   * Inserts 1 value into collection
   *
   * @remarks
   * Essentially syntactic sugar - internally calls the same function as `insertMany`
   * @param row
   */
  async insertOne(row: any):Promise<void> {
    this.logger.log(LogLevel.Debug, 'Inserting many');
    const pointer = this.logger.startTimer();
    await this.persistenceAdapter.insert([row]);
    this.logger.endTimer(LogLevel.Perf, pointer, "insert row");
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
  async findMany<T>(query: any, options:IQueryOptions): Promise<IFilterResult<T>> {
    this.logger.log(LogLevel.Debug, 'Finding many');
    const pointer = this.logger.startTimer();
    const result = await this.queryService.filter(query, options);
    this.logger.endTimer(LogLevel.Perf, pointer, "find many");
    return result;

  }

  /**
   * Update all matched rows
   * @param query
   * @param delta
   */
  async updateMany<T>(query: any, delta?: any): Promise<void> {
    this.logger.log(LogLevel.Debug, 'Updating many');
    const pointer = this.logger.startTimer();

    await this.persistenceAdapter.update(query, delta);
    this.logger.endTimer(LogLevel.Perf, pointer, "Updating many");

  }


}