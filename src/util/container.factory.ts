import { Container } from 'inversify';
import { selectPersistenceAdapterClass } from '../modules/persistence';
import SerializationModule from '../modules/serialization';
import QueryModule from '../modules/query';
import SystemModule from '../modules/system';
import QueueModule from '../modules/queue';
import { ILogger } from '../interfaces/logger.interface';
import { TYPES } from '../types';
import { LoglevelLogger } from '../modules/logger/loglevel';
import { IAggregator } from '../interfaces/aggregator.interface';
import { MingoAggregator } from '../modules/collection/mingo-aggregator';
import { ICamaConfig } from '../interfaces/cama-config.interface';
import { createMockContainer } from '../mocks/createMockContainer';
import { ICollectionConfig } from '../interfaces/collection-config.interface';


export const containerFactory = (collectionName: string, camaConfig: ICamaConfig, collectionConfig:ICollectionConfig): Container => {
  if(camaConfig.test){
    return createMockContainer(collectionName, camaConfig, collectionConfig);
  }
  const container = new Container();
  const persistenceModule = selectPersistenceAdapterClass(camaConfig.persistenceAdapter);
  container.load(persistenceModule);
  container.load(SerializationModule);
  container.load(QueryModule);
  container.load(SystemModule);
  container.load(QueueModule);
  container.bind<ILogger>(TYPES.Logger).to(LoglevelLogger).inSingletonScope();
  container.bind<IAggregator>(TYPES.Aggregator).to(MingoAggregator).inRequestScope();

  container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
  container.bind<ICollectionConfig>(TYPES.CollectionConfig).toConstantValue(collectionConfig);
  container.bind<string>(TYPES.CollectionName).toConstantValue(collectionName);

  return container;

};