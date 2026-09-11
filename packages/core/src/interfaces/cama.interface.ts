import { CollectionDescriptor, CollectionListOptions, CollectionListPage } from './collection-catalogue.interface';
import { ICollectionConfig } from './collection-config.interface';
import { ICollection } from './collection.interface';
import { Document } from './document-types';

export interface ICama {
  /**
   * Read declared metadata without creating or opening a collection.
   * Supported on filesystem and IndexedDB. Invalid metadata is rejected rather than repaired.
   * @param name - Collection name to inspect.
   * @returns Descriptor, or undefined when absent.
   */
  describeCollection(name: string): Promise<CollectionDescriptor | undefined>;
  /**
   * Check whether valid declared metadata exists for a collection.
   * Supports the same adapters and validation as `describeCollection`.
   * @param name - Collection name to inspect.
   * @returns True when valid metadata exists; malformed metadata still throws.
   */
  collectionExists(name: string): Promise<boolean>;
  /**
   * Read a bounded page of collection descriptors without opening collections.
   * Filesystem and IndexedDB only. Quiesce writers for a consistent catalogue view.
   * @param options - Exclusive name cursor and page limit (1–100, default 100).
   * @returns Descriptors and an optional next cursor.
   */
  listCollections(options?: CollectionListOptions): Promise<CollectionListPage>;
  /**
   * Create or open a typed collection and await metadata/cache readiness.
   * Collection names and metadata are validated before adapters are created.
   * @param collectionName - Single-component name: 1–255 characters, no separators, NUL, `.` or `..`.
   * @param config - Declared columns and indexes; use `{ columns: [], indexes: [] }` when no typed columns are needed.
   * @returns A ready typed collection. Existing metadata is retained when reopening.
   * @throws If metadata is invalid, storage is incompatible or initialization fails.
   */
  initCollection<TDocument extends object = Document>(
    collectionName: string,
    config: ICollectionConfig,
  ): Promise<ICollection<TDocument>>;
}
