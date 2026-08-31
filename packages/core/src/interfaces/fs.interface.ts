
export interface IFS {
  writeJSON<T>(path: string, fileName: string, data: T): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  loadJSON<T>(filePath: string): Promise<T>;
  commit(filePath: string, collection:string ): Promise<void>;


  mkdir(path: string):Promise<void>;
  readDir(path:string): Promise<any>;


  writeData(camaFolder:string, camaCollection:string, data: any):Promise<void>;
  readData<T>(path:string): Promise<T>;

  rmDir(outputPath: string, collectionName: string):Promise<void> ;
}
