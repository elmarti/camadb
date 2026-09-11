/** A filtered page and its counts before and after pagination. */
export interface IFilterResult<T> {
  /** Matching documents in requested order after offset and limit. */
  rows: Array<T>;
  /** Number of returned rows. */
  count: number;
  /** Number of matches before offset and limit. */
  totalCount: number;
}
