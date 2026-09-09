import { CollectionDescriptor, CollectionListOptions, CollectionListPage } from './collection-catalogue.interface';
import { ICollectionConfig } from './collection-config.interface';
import { ICollection } from './collection.interface';
import { Document } from './document-types';

export interface ICama {
  describeCollection(name: string): Promise<CollectionDescriptor | undefined>;
  collectionExists(name: string): Promise<boolean>;
  listCollections(options?: CollectionListOptions): Promise<CollectionListPage>;
  initCollection<TDocument extends object = Document>(
    collectionName: string,
    config: ICollectionConfig,
  ): Promise<ICollection<TDocument>>;
}
