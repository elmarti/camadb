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
import { ISerializer } from '../interfaces/serializer.interface';
import { SerializerMock } from './serializer';
import { LoggerMock } from './logger';

export const createMockContainer = (camaConfig: ICamaConfig): Container => {
  const container = new Container();

  container.bind<ISerializer>(TYPES.Serializer).to(SerializerMock)
  container.bind<ILogger>(TYPES.Logger).to(LoggerMock).inSingletonScope();
  container.bind<IAggregator>(TYPES.Aggregator).to(MingoAggregator).inRequestScope();
  container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
  return container;
};