

export interface IIndexer {
  addMetaData(dataset:Array<any>, rows:Array<any>):Promise<Array<any>>;
  index(rows:Array<any>):Promise<any>;
  search(query:any):Promise<Array<any>>;
}