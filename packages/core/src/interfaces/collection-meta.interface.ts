import { IMetaStructure } from './meta-structure.interface';

export interface ICollectionMeta {

  update(collectionName: string, metaStructure: IMetaStructure): Promise<void>;

  get(): Promise<IMetaStructure|undefined>;
}