import { ICollectionConfig } from './collection-config.interface';
import { ICollection } from './collection.interface';
import { Document } from './document-types';

export interface ICama {
  initCollection<TDocument extends object = Document>(collectionName: string, config: ICollectionConfig): Promise<ICollection<TDocument>>
}
