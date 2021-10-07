export interface IQueryService<T> {
  filter(query:any):Promise<T>;
}