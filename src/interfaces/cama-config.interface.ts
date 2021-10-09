import { PersistenceAdapterEnum } from './perisistence-adapter.enum';
import { LogLevel } from './logger-level.enum';

export interface ICamaConfig {
  persistenceAdapter: PersistenceAdapterEnum;
  path?: string;
  logLevel?: LogLevel
}