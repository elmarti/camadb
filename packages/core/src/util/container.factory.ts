import { ICamaConfig } from '../interfaces/cama-config.interface';
import { ICollectionConfig } from '../interfaces/collection-config.interface';
import { ICollectionMeta } from '../interfaces/collection-meta.interface';
import { IPersistenceAdapter } from '../interfaces/persistence-adapter.interface';
import { LoggerMock } from '../mocks/logger';
import { PersistenceAdapterMock } from '../mocks/persistence-adapter';
import { QueryServiceMock } from '../mocks/query.service';
import { SerializerMock } from '../mocks/serializer';
import { AggregatorMock } from '../mocks/aggregator';
import { MingoAggregator } from '../modules/collection/mingo-aggregator';
import { LoglevelLogger } from '../modules/logger/loglevel';
import { CollectionMeta as FsCollectionMeta } from '../modules/persistence/fs/collection-meta';
import FSPersistence from '../modules/persistence/fs/fs-persistence';
import { Fs } from '../modules/persistence/fs/fs';
import { CollectionMeta as IndexedDbCollectionMeta } from '../modules/persistence/indexeddb/collection-meta';
import IndexedDbPersistence from '../modules/persistence/indexeddb/indexeddb-persistence';
import { CollectionMeta as InMemoryCollectionMeta } from '../modules/persistence/inmemory/collection-meta';
import InMemoryPersistence from '../modules/persistence/inmemory/inmemory-persistence';
import { CollectionMeta as LocalStorageCollectionMeta } from '../modules/persistence/localstorage/collection-meta';
import LocalStoragePersistence from '../modules/persistence/localstorage/localstorage-persistence';
import { QueryService } from '../modules/query/query.service';
import { QueueService } from '../modules/queue/queue.service';
import { FlattedSerializer } from '../modules/serialization/flatted-serializer';
import { NodeSystem } from '../modules/system/node.system';
import { NoopSystem } from '../modules/system/noop.system';
import { TYPES } from '../types';
import { ServiceRegistry } from './service-registry';
import { CachedPersistence } from '../modules/persistence/cached-persistence';
import { MetadataIndexedPersistence } from '../modules/persistence/metadata-indexed-persistence';
import { FullTextIndexedPersistence } from '../modules/search/full-text-indexed-persistence';

export const containerFactory = (
  collectionName: string,
  camaConfig: ICamaConfig,
  collectionConfig: ICollectionConfig,
): ServiceRegistry => {
  const registry = new ServiceRegistry();
  const queue = new QueueService();
  const metadataQueue = new QueueService();
  const mutationQueue = new QueueService();

  if (camaConfig.test) {
    const persistence = new PersistenceAdapterMock();
    return registry
      .set(TYPES.Logger, new LoggerMock())
      .set(TYPES.Serializer, new SerializerMock())
      .set(TYPES.PersistenceAdapter, persistence)
      .set(TYPES.QueryService, new QueryServiceMock())
      .set(TYPES.QueueService, queue)
      .set(TYPES.Aggregator, new AggregatorMock());
  }

  const logger = new LoglevelLogger(camaConfig);
  const serializer = new FlattedSerializer(logger);
  const system = camaConfig.persistenceAdapter === 'fs' ? new NodeSystem(camaConfig) : new NoopSystem(camaConfig);
  let collectionMeta: ICollectionMeta;
  let persistence: IPersistenceAdapter;

  switch (camaConfig.persistenceAdapter) {
    case 'fs': {
      const fs = new Fs(serializer, logger);
      collectionMeta = new FsCollectionMeta(fs, camaConfig, collectionConfig, collectionName, logger, system, metadataQueue);
      persistence = new FSPersistence(camaConfig, collectionMeta, fs, logger, collectionName, system, mutationQueue);
      registry.set(TYPES.FS, fs);
      break;
    }
    case 'indexeddb':
      collectionMeta = new IndexedDbCollectionMeta(camaConfig, collectionConfig, collectionName);
      persistence = new IndexedDbPersistence(camaConfig, logger, collectionName);
      break;
    case 'localstorage':
      collectionMeta = new LocalStorageCollectionMeta(camaConfig, collectionConfig, collectionName);
      persistence = new LocalStoragePersistence(camaConfig, logger, collectionName);
      break;
    case 'inmemory':
      collectionMeta = new InMemoryCollectionMeta(collectionName, collectionConfig);
      persistence = new InMemoryPersistence();
      break;
    default:
      throw new Error(`Unknown adapter type: ${camaConfig.persistenceAdapter}`);
  }

  persistence = new CachedPersistence(persistence, camaConfig.cache);
  persistence = new MetadataIndexedPersistence(persistence, collectionMeta, collectionConfig.indexes);
  persistence = new FullTextIndexedPersistence(persistence, collectionMeta, collectionConfig.searchIndexes ?? []);

  return registry
    .set(TYPES.Logger, logger)
    .set(TYPES.Serializer, serializer)
    .set(TYPES.System, system)
    .set(TYPES.CollectionMeta, collectionMeta)
    .set(TYPES.PersistenceAdapter, persistence)
    .set(TYPES.QueryService, new QueryService(collectionMeta, persistence, logger))
    .set(TYPES.QueueService, queue)
    .set(TYPES.Aggregator, new MingoAggregator(persistence));
};
