import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';

export class CollectionMeta implements ICollectionMeta {
  private readonly key?: string;
  private meta?: IMetaStructure;

  constructor(config?: ICamaConfig, collectionConfig?: ICollectionConfig, collectionName?: string) {
    if (!collectionName || !collectionConfig) return;
    this.key = `${config?.path || 'cama'}-${collectionName}-collection-meta`;
    const stored = window.localStorage.getItem(this.key);
    this.meta = stored ? JSON.parse(stored) as IMetaStructure : { ...collectionConfig, collectionName };
    if (!stored) this.persist();
  }


  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {
    this.meta = { ...metaStructure, collectionName };
    this.persist();
  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    return this.meta;
  }

  private persist(): void {
    if (this.key && this.meta) window.localStorage.setItem(this.key, JSON.stringify(this.meta));
  }
}
