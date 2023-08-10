import { IColumnConfig } from './column-config.interface';
import { IIndexConfig } from './index-config.interface';

export interface ICollectionConfig {
  columns: Array<IColumnConfig>;
  indexes: Array<IIndexConfig>;
}