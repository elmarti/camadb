export interface IFilterResult<T> {
  rows: Array<T>;
  count: number;
  totalCount: number;
}