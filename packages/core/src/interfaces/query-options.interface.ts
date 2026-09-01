import { ISortByObjectSorter } from 'fast-sort';

export interface ISortOptions {
  field: string;
  direction: "ASC"| "DESC";
}
export interface IQueryOptions<TDocument = unknown> {
  sort?: ISortByObjectSorter<TDocument> | ISortByObjectSorter<TDocument>[];
  limit?: number;
  offset?: number;
}
