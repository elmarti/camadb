/** @module core */
import { selectCollectionCatalogue } from './modules/persistence/catalogue';
import { CollectionListOptions } from './interfaces/collection-catalogue.interface';
import { ICama } from './interfaces/cama.interface';
import { ICollectionConfig } from './interfaces/collection-config.interface';
import { ICamaConfig } from './interfaces/cama-config.interface';
import { ICollection } from './interfaces/collection.interface';
import { Collection } from './modules/collection';
import { Document } from './interfaces/document-types';

export class Cama implements ICama {
  /**
   * {@inheritDoc ICama.describeCollection}
   */
  async describeCollection(name: string) {
    return selectCollectionCatalogue(this.camaConfig).describeCollection(name);
  }
  /**
   * {@inheritDoc ICama.collectionExists}
   */
  async collectionExists(name: string): Promise<boolean> {
    return !!(await this.describeCollection(name));
  }
  /**
   * {@inheritDoc ICama.listCollections}
   */
  async listCollections(options?: CollectionListOptions) {
    return selectCollectionCatalogue(this.camaConfig).listCollections(options);
  }
  private camaConfig: ICamaConfig;

  /**
   * Configure a local database; no collection is created until initialization.
   * @param camaConfig - Runtime-compatible persistence adapter, path and optional cache/compaction settings.
   */
  constructor(camaConfig: ICamaConfig) {
    this.camaConfig = camaConfig;
  }

  /**
   * {@inheritDoc ICama.initCollection}
   */
  async initCollection<TDocument extends object = Document>(
    collectionName: string,
    config: ICollectionConfig,
  ): Promise<ICollection<TDocument>> {
    const collection = new Collection<TDocument>(collectionName, config, this.camaConfig);
    await collection.initializeCache();
    return collection;
  }
}

export { Collection };

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
export type {
  AggregationPipeline,
  AggregationStage,
  Document,
  DocumentId,
  FieldFilter,
  Filter,
  InsertDocument,
  StoredDocument,
  Update,
} from './interfaces/document-types';
export type {
  DeleteResult,
  InsertManyResult,
  InsertOneResult,
  UpdateResult,
} from './interfaces/mutation-result.interface';
export type { IPersistenceAdapter } from './interfaces/persistence-adapter.interface';
export type { StorageStats } from './interfaces/persistence-adapter.interface';
export type { TextSearchHit, TextSearchMatch, TextSearchOptions } from './interfaces/text-search.interface';
export type {
  VectorField,
  VectorIndexConfig,
  VectorMetric,
  VectorSearchHit,
  VectorSearchOptions,
} from './interfaces/vector-search.interface';
export type {
  HybridSearchHit,
  HybridSearchOptions,
  HybridFusion,
  HybridTextComponent,
  HybridVectorComponent,
  ReciprocalRankFusion,
  WeightedScoreFusion,
} from './interfaces/hybrid-search.interface';
export {
  CURRENT_STORAGE_VERSION,
  LEGACY_STORAGE_VERSION,
  LEGACY_STORAGE_MESSAGE,
  LegacyStorageError,
  createStorageEnvelope,
  detectStorage,
  isStorageEnvelope,
} from './modules/persistence/storage-version';
export type { StorageDetection, StorageEnvelope } from './modules/persistence/storage-version';

export type {
  ICollectionCatalogue,
  CollectionDescriptor,
  CollectionListOptions,
  CollectionListPage,
} from './interfaces/collection-catalogue.interface';
