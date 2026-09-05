import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';
import { IndexedDbDatabaseCoordinator } from './database-coordinator';

export class CollectionMeta implements ICollectionMeta {
  private static readonly key = 'collection-metadata';
  private readonly databaseName?: string;
  private readonly initialized: Promise<void>;
  private meta?: IMetaStructure;

  constructor(config?: ICamaConfig, collectionConfig?: ICollectionConfig, private collectionName?: string) {
    if (!collectionName || !collectionConfig) {
      this.initialized = Promise.resolve();
      return;
    }
    this.databaseName = config?.path || 'cama';
    this.initialized = IndexedDbDatabaseCoordinator.ensureStore(this.databaseName, collectionName).then(async () => {
      await IndexedDbDatabaseCoordinator.run(this.databaseName!, async (db) => {
        const store = db.transaction(collectionName, 'readwrite').objectStore(collectionName);
        this.meta = await store.get(CollectionMeta.key) as IMetaStructure | undefined;
        if (!this.meta) {
          this.meta = { ...collectionConfig, collectionName };
          await store.put(this.meta, CollectionMeta.key);
        }
      });
    });
  }

  /**
   * Update the meta value
   * @param collectionName - the name of the collection
   * @param metaStructure - the value to be to be applied to the meta
   */
  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {
    await this.initialized;
    this.meta = { ...metaStructure, collectionName };
    if (!this.collectionName || !this.databaseName) return;
    await IndexedDbDatabaseCoordinator.run(this.databaseName, async (db) => {
      const transaction = db.transaction(this.collectionName!, 'readwrite');
      await transaction.objectStore(this.collectionName!).put(this.meta, CollectionMeta.key);
      await transaction.done;
    });
  }

  /**
   * Gets the in-memory meta value
   */
  async get(): Promise<IMetaStructure|undefined> {
    await this.initialized;
    return this.meta;
  }
}
