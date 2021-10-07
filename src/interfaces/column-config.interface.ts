import { ColumnDataTypes } from './column-data-types';

export interface IColumnConfig {
  type: ColumnDataTypes;
  nullable: boolean;
}