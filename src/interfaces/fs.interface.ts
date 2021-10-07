import { IPagingAllocation } from './paging-allocation.interface';

export interface IFS {
  writeJSON<T>(path: string, fileName: string, data: T): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  loadJSON<T>(filePath: string): Promise<T>;
  writePages<T>(camaFolder:string, collectionName: string, allocations: Array<IPagingAllocation<T>>): Promise<Array<string>>;
  commitPages(filePaths: Array<string>): Promise<void>;


  mkdir(path: string):Promise<void>;
  readDir(path:string): Promise<any>;

  loadPage(file: string):Promise<any> ;
}
