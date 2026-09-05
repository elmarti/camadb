import { IColumnConfig } from './column-config.interface';

export interface ICollectionConfig {
  columns: Array<IColumnConfig>;
  indexes: Array<string>;
  /** Top-level string fields included in the derived full-text index. */
  searchIndexes?: Array<string>;
}
