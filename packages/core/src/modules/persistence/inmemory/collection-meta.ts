import { validateCollectionMetadata } from '../catalogue-validation';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';

export class CollectionMeta implements ICollectionMeta {
  private meta?: IMetaStructure;

  constructor(collectionName?: string, config?: ICollectionConfig) {
    if (collectionName && config) {
      validateCollectionMetadata(collectionName, { ...config, collectionName });
      this.meta = { ...config, collectionName };
    }
  }

  /**
   * Initialise the collection meta
   * @private
   * @remarks Internal method - don't call it
   * @param collectionName - The name of the collection
   * @param config - The collection config
   */
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    validateCollectionMetadata(collectionName, { ...config, collectionName });
    this.meta ??= { ...config, collectionName };
  }

  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {
    if (this.meta?.collectionName && this.meta?.collectionName !== collectionName)
      throw new Error('Collection metadata cannot rename its collection.');
    validateCollectionMetadata(collectionName, { ...metaStructure, collectionName });
    this.meta = { ...metaStructure, collectionName };
  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure | undefined> {
    return this.meta;
  }
}
