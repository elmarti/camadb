import { PersistenceAdapterEnum } from './perisistence-adapter.enum';

export interface ICamaConfig {
  persistenceAdapter: PersistenceAdapterEnum;
  path: string;
  pageLength: number;
}