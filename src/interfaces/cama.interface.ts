import { ICollectionConfig } from './collection-config.interface';
import { ICollection } from './collection.interface';

export interface ICama {
  initCollection<T>(collectionName: string, config: ICollectionConfig): Promise<ICollection>
}