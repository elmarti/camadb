import { injectable } from 'inversify';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';

@injectable()
export class CollectionMeta implements ICollectionMeta {
  private meta:any;


  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {

    return Promise.resolve();

  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    return this.meta;
  }
}
