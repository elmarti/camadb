

export interface IIndexer {
  addMetaData(dataset:Array<any>, rows:Array<any>):Promise<Array<any>>;
  index(index: INrows:Array<any>):Promise<any>;
}