import { IColumnConfig } from './column-config.interface';
/** Declared metadata, not an inferred schema or a promise about every document. */
export interface CollectionDescriptor {
  name: string;
  columns: IColumnConfig[];
  indexes: string[];
}
export interface CollectionListOptions {
  /** Lexicographic exclusive collection-name cursor. */
  after?: string;
  /** 1–100 entries; defaults to 100. */
  limit?: number;
}
export interface CollectionListPage {
  collections: CollectionDescriptor[];
  nextCursor?: string;
}

/** Optional database-level capability, independent of collection initialization. */
export interface ICollectionCatalogue {
  describeCollection(name: string): Promise<CollectionDescriptor | undefined>;
  listCollections(options?: CollectionListOptions): Promise<CollectionListPage>;
}
