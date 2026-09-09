import { ICamaConfig } from '../../interfaces/cama-config.interface';
import { ICollectionCatalogue } from '../../interfaces/collection-catalogue.interface';

/** Select without constructing a collection persistence adapter (which may write). */
export function selectCollectionCatalogue(config: ICamaConfig): ICollectionCatalogue {
  let adapter: {
    describeCollection: (config: ICamaConfig, name: string) => ReturnType<ICollectionCatalogue['describeCollection']>;
    listCollections: (
      config: ICamaConfig,
      options?: Parameters<ICollectionCatalogue['listCollections']>[0],
    ) => ReturnType<ICollectionCatalogue['listCollections']>;
  };
  switch (config.persistenceAdapter) {
    case 'fs':
      adapter = require('./fs/catalogue');
      break;
    case 'indexeddb':
      adapter = require('./indexeddb/catalogue');
      break;
    default:
      throw new Error(`Collection catalogue is not supported by adapter: ${config.persistenceAdapter}`);
  }
  return {
    describeCollection: (name) => adapter.describeCollection(config, name),
    listCollections: (options) => adapter.listCollections(config, options),
  };
}
