import { IDbPage } from './db-page.interface';
import { ICollectionConfig } from './collection-config.interface';

export interface IMetaStructure extends ICollectionConfig {
  collectionName: string;
}