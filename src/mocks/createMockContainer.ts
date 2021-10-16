import { Container } from 'inversify';

import { ILogger } from '../interfaces/logger.interface';
import { TYPES } from '../types';
import { IAggregator } from '../interfaces/aggregator.interface';
import { ICamaConfig } from '../interfaces/cama-config.interface';
import { ISerializer } from '../interfaces/serializer.interface';
import { SerializerMock } from './serializer';
import { LoggerMock } from './logger';
import { AggregatorMock } from './aggregator';
import { IPersistenceAdapter } from '../interfaces/persistence-adapter.interface';
import { PersistenceAdapterMock } from './persistence-adapter';
import { IQueryService } from '../interfaces/query-service.interface';
import { QueryServiceMock } from './query.service';
import { ICollectionConfig } from '../interfaces/collection-config.interface';

export const createMockContainer = (collectionName: string, camaConfig: ICamaConfig, collectionConfig: ICollectionConfig): Container => {
  const container = new Container();

  container.bind<ISerializer>(TYPES.Serializer).to(SerializerMock)
  container.bind<ILogger>(TYPES.Logger).to(LoggerMock).inSingletonScope();
  container.bind<IAggregator>(TYPES.Aggregator).to(AggregatorMock).inRequestScope();
  container.bind<ICamaConfig>(TYPES.CamaConfig).toConstantValue(camaConfig);
  container.bind<ICollectionConfig>(TYPES.CollectionConfig).toConstantValue(collectionConfig);
  container.bind<string>(TYPES.CollectionName).toConstantValue(collectionName);

  container.bind<IPersistenceAdapter>(TYPES.PersistenceAdapter).to(PersistenceAdapterMock).inSingletonScope();
  container.bind<IQueryService<any>>(TYPES.QueryService).to(QueryServiceMock).inSingletonScope()
  return container;
};