import { IColumnConfig } from './column-config.interface';

export interface ICollectionConfig {
  columns: Array<IColumnConfig>;
  indexes: Array<IIndexConfig>;
}