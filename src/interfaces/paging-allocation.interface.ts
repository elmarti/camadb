export interface IPagingAllocation<T> {
  rows: Array<T>;
  pageKey: string;
  new?: boolean;
}