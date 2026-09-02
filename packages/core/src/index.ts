import { ICama } from './interfaces/cama.interface';
import { ICollectionConfig } from './interfaces/collection-config.interface';
import { ICamaConfig } from './interfaces/cama-config.interface';
import { ICollection } from './interfaces/collection.interface';
import { Collection } from './modules/collection';
import { Document } from './interfaces/document-types';

export class Cama implements ICama {
  private camaConfig: ICamaConfig;

  constructor(camaConfig: ICamaConfig) {
    this.camaConfig = camaConfig;

  }



  /**
   * Initializes a collection with the appropriate persistence adapter
   *
   * @remarks
   * Initialises collection metadata if non-existent, else loads it
   *
   * @param collectionName - the collection name
   * @param config - The collection configuration
   * @returns an initialised collection
   */
  async initCollection<TDocument extends object = Document>(collectionName: string, config: ICollectionConfig): Promise<ICollection<TDocument>> {
    const collection = new Collection<TDocument>(collectionName, config, this.camaConfig);
    await collection.initializeCache();
    return collection;
  }
}

export {
  Collection
}

export { PersistenceAdapterEnum } from './interfaces/perisistence-adapter.enum';
export { LogLevel } from './interfaces/logger-level.enum';
export type { ICama } from './interfaces/cama.interface';
export type { ICamaConfig } from './interfaces/cama-config.interface';
export type { CacheConfig, CacheMode, CacheStats } from './interfaces/cache.interface';
export type { ICollection } from './interfaces/collection.interface';
export type { ICollectionConfig } from './interfaces/collection-config.interface';
export type { IColumnConfig } from './interfaces/column-config.interface';
export type { IFilterResult } from './interfaces/filter-result.interface';
export type { IQueryOptions } from './interfaces/query-options.interface';
export type { AggregationPipeline, AggregationStage, Document, DocumentId, FieldFilter, Filter, InsertDocument, StoredDocument, Update } from './interfaces/document-types';
export type { DeleteResult, InsertManyResult, InsertOneResult, UpdateResult } from './interfaces/mutation-result.interface';
export type { IPersistenceAdapter } from './interfaces/persistence-adapter.interface';
export type { StorageStats } from './interfaces/persistence-adapter.interface';
export {
  CURRENT_STORAGE_VERSION,
  LEGACY_STORAGE_VERSION,
  createStorageEnvelope,
  detectStorage,
  exportLegacyStorage,
  isStorageEnvelope,
  migrateLegacyStorage,
} from './modules/persistence/storage-version';
export type { StorageDetection, StorageEnvelope } from './modules/persistence/storage-version';
