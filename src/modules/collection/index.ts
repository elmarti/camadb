import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { Container, inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';
import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { LogLevel } from '../../interfaces/logger-level.enum';
import { IFilterResult } from '../../interfaces/filter-result.interface';
import { selectPersistenceAdapterClass } from '../persistence';
import SerializationModule from '../serialization';
import QueryModule from '../query';
import { WinstonLogger } from '../logger/winston';
import { ICamaConfig } from '../../interfaces/cama-config.interface';
import PQueue from 'p-queue';

@injectable()
export class Collection  implements ICollection   {


  private config?: ICollectionConfig;
  private name?: string;
  private container: Container;
  private logger: ILogger;
  private persistenceAdapter: IPersistenceAdapter;
  private queryService: IQueryService<any>;
  private queue = new PQueue({ concurrency: 1 });



  constructor(
    collectionName: string,
    collectionConfig: ICollectionConfig,
    camaConfig: ICamaConfig
    ) {
    this.container = new Container();
    const persistenceModule = selectPersistenceAdapterClass(camaConfig.persistenceAdapter);
    this.container.load(persistenceModule);
    this.container.load(SerializationModule);
    this.container.load(QueryModule);
    this.container.bind<ILogger>(TYPES.Logger).to(WinstonLogger).inSingletonScope();
    this.container.bind<ICollection>(TYPES.Collection).to(Collection).inRequestScope();
    this.container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
    this.logger = this.container.get<ILogger>(TYPES.Logger);
    this.persistenceAdapter = this.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
    this.queryService = this.container.get<IQueryService<any>>(TYPES.QueryService);
    this.logger.log(LogLevel.Debug, 'Initializing collection');
    this.name = collectionName;
    this.config = collectionConfig;
    this.logger.log(LogLevel.Debug, 'Initializing persistence adapter');
    this.queue.add(() => (async (name,config)=> {
      const pointer = this.logger.startTimer();
      console.log('initialising collection',  name,config);
      await this.persistenceAdapter.initCollection(name, config);
      this.logger.endTimer(LogLevel.Perf, pointer, "init collection");
    })(collectionName, collectionConfig))
  }


  /**
   * Insert many values into collection
   * @param rows - The values to be inserted
   */
  async insertMany(rows:Array<any>):Promise<void> {
    this.logger.log(LogLevel.Debug, 'Inserting many');
    await this.queue.add(() => (async (rows) => {
      const pointer = this.logger.startTimer();
      console.log('inserting')
      await this.persistenceAdapter.insert(rows);
      this.logger.endTimer(LogLevel.Perf, pointer, "insert  rows");
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
    this.logger.log(LogLevel.Debug, 'Inserting many');
    const pointer = this.logger.startTimer();
    await this.insertMany([row]);
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
    const result = await this.queue.add(() => (async (query, options) => {
      return await this.queryService.filter(query, options);
    })(query, options));
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
    await this.queue.add(() => (async (query, delta) => {
      await this.persistenceAdapter.update(query, delta);
    })(query, delta))
    this.logger.endTimer(LogLevel.Perf, pointer, "Updating many");

  }


}