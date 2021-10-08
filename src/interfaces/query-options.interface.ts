import { ISortByObjectSorter } from 'fast-sort';

export interface ISortOptions {
  field: string;
  direction: "ASC"| "DESC";
}
export interface IQueryOptions {
  sort?: ISortByObjectSorter<any> | ISortByObjectSorter<any>[];
  limit?: number;
  offset?: number;
}