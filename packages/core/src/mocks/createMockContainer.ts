import { TYPES } from '../types';
import { ICamaConfig } from '../interfaces/cama-config.interface';
import { SerializerMock } from './serializer';
import { LoggerMock } from './logger';
import { AggregatorMock } from './aggregator';
import { PersistenceAdapterMock } from './persistence-adapter';
import { QueryServiceMock } from './query.service';
import { ICollectionConfig } from '../interfaces/collection-config.interface';
import { QueueService } from '../modules/queue/queue.service';
import { ServiceRegistry } from '../util/service-registry';

export const createMockContainer = (
  collectionName: string,
  camaConfig: ICamaConfig,
  collectionConfig: ICollectionConfig,
): ServiceRegistry => {
  return new ServiceRegistry()
    .set(TYPES.Serializer, new SerializerMock())
    .set(TYPES.Logger, new LoggerMock())
    .set(TYPES.Aggregator, new AggregatorMock())
    .set(TYPES.CamaConfig, camaConfig)
    .set(TYPES.CollectionConfig, collectionConfig)
    .set(TYPES.CollectionName, collectionName)
    .set(TYPES.QueueService, new QueueService())
    .set(TYPES.PersistenceAdapter, new PersistenceAdapterMock())
    .set(TYPES.QueryService, new QueryServiceMock());
};
