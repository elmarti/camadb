

import { ContainerModule, interfaces } from 'inversify';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { TYPES } from '../../../types';
import InmemoryPersistence from './inmemory-persistence';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { CollectionMeta } from './collection-meta';


/**
 * Initialise the IndexedDb adapter module
 */
export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<IPersistenceAdapter>(TYPES.PersistenceAdapter).to(InmemoryPersistence).inSingletonScope();
  bind<ICollectionMeta>(TYPES.CollectionMeta).to(CollectionMeta).inSingletonScope();
});
