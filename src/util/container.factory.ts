import { Container } from 'inversify';
import { selectPersistenceAdapterClass } from '../modules/persistence';
import SerializationModule from '../modules/serialization';
import QueryModule from '../modules/query';
import { ILogger } from '../interfaces/logger.interface';
import { TYPES } from '../types';
import { LoglevelLogger } from '../modules/logger/loglevel';
import { IAggregator } from '../interfaces/aggregator.interface';
import { MingoAggregator } from '../modules/collection/mingo-aggregator';
import { ICamaConfig } from '../interfaces/cama-config.interface';
import { createMockContainer } from '../mocks/createMockContainer';
import IndexingModule from '../modules/indexing';


export const containerFactory = (camaConfig: ICamaConfig): Container => {
  if(camaConfig.test){
    return createMockContainer(camaConfig);
  }
  const container = new Container();
  const persistenceModule = selectPersistenceAdapterClass(camaConfig.persistenceAdapter);
  container.load(persistenceModule);
  container.load(SerializationModule);
  container.load(QueryModule);
  container.load(IndexingModule)
  container.bind<ILogger>(TYPES.Logger).to(LoglevelLogger).inSingletonScope();
  container.bind<IAggregator>(TYPES.Aggregator).to(MingoAggregator).inRequestScope();

  container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
  return container;

};