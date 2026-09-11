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
  /**
   * Read declared metadata without creating or opening a collection.
   * Supported on filesystem and IndexedDB. Invalid metadata is rejected rather than repaired.
   * @param name - Collection name to inspect.
   * @returns Descriptor, or undefined when absent.
   */
  describeCollection(name: string): Promise<CollectionDescriptor | undefined>;
  /**
   * Read a bounded page of collection descriptors without opening collections.
   * Filesystem and IndexedDB only. Quiesce writers for a consistent catalogue view.
   * @param options - Exclusive name cursor and page limit (1–100, default 100).
   * @returns Descriptors and an optional next cursor.
   */
  listCollections(options?: CollectionListOptions): Promise<CollectionListPage>;
}
