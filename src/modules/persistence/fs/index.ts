import { ContainerModule, interfaces } from 'inversify';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import FSPersistence from './fs-persistence';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { CollectionMeta } from './collection-meta';
import { IFS } from '../../../interfaces/fs.interface';
import { Fs } from './fs';
import { FsPaging } from './fs-paging';
import { IPaging } from '../../../interfaces/paging.interface';


/**
 * Initialise the FS Adapter module
 */
export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind) => {
  bind<IPersistenceAdapter>(TYPES.PersistenceAdapter).to(FSPersistence).inSingletonScope();
  bind<ICollectionMeta>(TYPES.CollectionMeta).to(CollectionMeta).inSingletonScope();
  bind<IPaging<any>>(TYPES.Paging).to(FsPaging).inSingletonScope();
  bind<IFS>(TYPES.FS).to(Fs).inSingletonScope();
});
