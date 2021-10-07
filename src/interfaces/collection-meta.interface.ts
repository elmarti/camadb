import { ICollectionConfig } from './collection-config.interface';
import { IMetaStructure } from './meta-structure.interface';

export interface ICollectionMeta {
  init(collectionName: string, config: ICollectionConfig): Promise<void>;

  update(collectionName: string, metaStructure: IMetaStructure): Promise<void>;

  get(): Promise<IMetaStructure|undefined>;
}