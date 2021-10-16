import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { Container, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';
import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { IFilterResult } from '../../interfaces/filter-result.interface';

import { ICamaConfig } from '../../interfaces/cama-config.interface';
import PQueue from 'p-queue';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { containerFactory } from '../../util/container.factory';

@injectable()
export class Collection  implements ICollection   {
  public container: Container;
  private config?: ICollectionConfig;
  private name?: string;
  private logger: ILogger;
  private persistenceAdapter: IPersistenceAdapter;
  private queryService: IQueryService<any>;
  private queue = new PQueue({ concurrency: 1 });
  private destroyed = false;
  private aggregator: IAggregator;


  constructor(
    collectionName: string,
    collectionConfig: ICollectionConfig,
    camaConfig: ICamaConfig
    ) {

    this.container = containerFactory(camaConfig)
    this.logger = this.container.get<ILogger>(TYPES.Logger);
    this.persistenceAdapter = this.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    this.queryService = this.container.get<IQueryService<any>>(TYPES.QueryService);
    this.aggregator = this.container.get<IAggregator>(TYPES.Aggregator);
    this.logger.log(LogLevel.Debug, 'Initializing collection');
    this.name = collectionName;
    this.config = collectionConfig;
    this.logger.log(LogLevel.Debug, 'Initializing persistence adapter');
    this.queue.add(() => (async (name,config)=> {
      const pointer = this.logger.startTimer();
      await this.persistenceAdapter.initCollection(name, config);
      this.logger.endTimer(LogLevel.Debug, pointer, "init collection");
    })(collectionName, collectionConfig))
  }


  /**
   * Insert many values into collection
   * @param rows - The values to be inserted
   */
  async insertMany(rows:Array<any>):Promise<void> {
    this.checkDestroyed();
    this.logger.log(LogLevel.Debug, 'Inserting many');

    await this.queue.add(() => (async (rows) => {
      const pointer = this.logger.startTimer();
      await this.persistenceAdapter.insert(rows);

      this.logger.endTimer(LogLevel.Debug, pointer, "insert  rows");
    })(rows))
  }

  /**
   * Inserts 1 value into collection
   *
   * @remarks
   * Essentially syntactic sugar - internally calls the same function as `insertMany`
   * @param row
   */
  async insertOne(row: any):Promise<void> {
    this.checkDestroyed();
    this.logger.log(LogLevel.Debug, 'Inserting many');
    const pointer = this.logger.startTimer();
    await this.insertMany([row]);
    this.logger.endTimer(LogLevel.Debug, pointer, "insert row");
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
  async findMany<T>(query: any, options?: IQueryOptions): Promise<IFilterResult<T>> {
    this.checkDestroyed();
    this.logger.log(LogLevel.Debug, 'Finding many');
    const pointer = this.logger.startTimer();
    const result = await this.queue.add(() => (async (query, options) => {
      return await this.queryService.filter(query, options);
    })(query, options));
    this.logger.endTimer(LogLevel.Debug, pointer, "find many");
    return result;

  }

  /**
   * Update all matched rows
   * @param query
   * @param delta
   */
  async updateMany<T>(query: any, delta: any): Promise<void> {
    this.checkDestroyed();
    this.logger.log(LogLevel.Debug, 'Updating many');
    const pointer = this.logger.startTimer();
    await this.queue.add(() => (async (query, delta) => {
      await this.queryService.update(query, delta);
    })(query, delta))
    this.logger.endTimer(LogLevel.Debug, pointer, "Updating many");

  }

  /**
   * Destroy the collection
   * @remarks After calling this, the collection instance becomes unusable
   */
  async destroy(): Promise<void> {
    await this.persistenceAdapter.destroy();
    this.destroyed = true;
  }

  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }

  /**
   * Perform MongoDB style aggregations
   * @param pipeline
   */
  async aggregate(pipeline:Array<any>):Promise<any> {
    return this.aggregator.aggregate(pipeline);
  }

}