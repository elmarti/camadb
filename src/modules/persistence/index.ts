import { PersistenceAdapterEnum } from '../../interfaces/perisistence-adapter.enum';

export const selectPersistenceAdapterClass = (adapter:PersistenceAdapterEnum) => {
  switch(adapter){
    case 'fs':
      // @ts-ignore
      if (typeof window === 'undefined') {
        return require('./fs').default;
      }
    case 'indexeddb':
      return require('./indexeddb').default;
    case 'localstorage':
      return require('./localstorage').default;
    case 'inmemory':
      return require('./inmemory').default;
    default:
      throw new Error();
  }
}