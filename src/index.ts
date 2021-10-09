import { ICama } from './interfaces/cama.interface';
import { ICollectionConfig } from './interfaces/collection-config.interface';
import { Container } from 'inversify';
import { ICamaConfig } from './interfaces/cama-config.interface';
import { IPersistenceAdapter } from './interfaces/persistence-adapter.interface';
import { selectPersistenceAdapterClass } from './modules/persistence';
import { TYPES } from './types';
import { ICollection } from './interfaces/collection.interface';
import { Collection } from './modules/collection';
import SerializationModule from  './modules/serialization';
import QueryModule from  './modules/query';

import 'reflect-metadata';
import { WinstonLogger } from './modules/logger/winston';
import { ILogger } from './interfaces/logger.interface';


export class Cama implements ICama {
  private container: Container;

  constructor(camaConfig: ICamaConfig) {
    if(!camaConfig.pageLength){
      camaConfig.pageLength = 10000;
    }
    this.container = new Container();
    const persistenceModule = selectPersistenceAdapterClass(camaConfig.persistenceAdapter);
    this.container.load(persistenceModule);
    this.container.load(SerializationModule);
    this.container.load(QueryModule);
    this.container.bind<ILogger>(TYPES.Logger).to(WinstonLogger).inSingletonScope();
    this.container.bind<ICollection>(TYPES.Collection).to(Collection).inRequestScope();
    this.container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);

  }


  private _getPersistenceAdapter(): IPersistenceAdapter {
    return this.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
  }

  /**
   * Initializes a collection with the appropriate persistence adapter
   *
   * @remarks
   * Initialises collection metadata if non-existent, else loads it
   *
   * @param collectionName - the collection name
   * @param config - The collection configuration
   * @returns an initialised collection
   */
  async initCollection<T>(collectionName: string, config: ICollectionConfig): Promise<ICollection> {
    const collection = this.container.get<ICollection>(TYPES.Collection);
    await collection.init(collectionName, config);
    return collection;
  }
}

export {
  Collection

}