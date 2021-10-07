import { IPagingAllocation } from './paging-allocation.interface';
import { ICollectionConfig } from './collection-config.interface';


export interface IPaging<T> {
  allocate(rows: Array<T>): Promise<Array<IPagingAllocation<T>>>;

  commit(): Promise<void>;

  init(collectionName: string, config: ICollectionConfig): Promise<void>;
}