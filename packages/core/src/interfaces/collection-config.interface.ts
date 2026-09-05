import { IColumnConfig } from './column-config.interface';
import { VectorIndexConfig } from './vector-search.interface';

export interface ICollectionConfig {
  columns: Array<IColumnConfig>;
  indexes: Array<string>;
  /** Top-level string fields included in the derived full-text index. */
  searchIndexes?: Array<string>;
  /** Top-level numeric-vector fields available to exact vector search. */
  vectorIndexes?: Array<VectorIndexConfig>;
}
