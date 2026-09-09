import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import {
  CollectionDescriptor,
  CollectionListOptions,
  CollectionListPage,
} from '../../../interfaces/collection-catalogue.interface';
import { catalogueName, catalogueLimit, collectionDescriptor } from '../catalogue-validation';

/** Abort first-creation upgrades; never commit a missing database or change its version. */
function openExisting(name: string): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    let missing = false;
    let abandoned = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = (event) => {
      missing = event.oldVersion === 0;
      request.transaction!.abort();
    };
    request.onerror = (event) => {
      event.preventDefault();
      if (missing && request.error?.name === 'AbortError') resolve(undefined);
      else reject(request.error ?? new Error('Unable to inspect IndexedDB catalogue.'));
    };
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('IndexedDB catalogue open is blocked by another connection.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (abandoned) db.close();
      else resolve(db);
    };
  });
}
function readMetadata(db: IDBDatabase, name: string): Promise<CollectionDescriptor | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readonly');
    const request = tx.objectStore(name).get('collection-metadata');
    let descriptor: CollectionDescriptor | undefined;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        if (request.result === undefined) return;
        // Structured clone occurs before inspection; this is a validation bound, not a read-memory guarantee.
        const encoded = JSON.stringify(request.result);
        if (new TextEncoder().encode(encoded).byteLength > 262144)
          throw new Error('Collection metadata exceeds 256 KiB.');
        descriptor = collectionDescriptor(name, request.result);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(descriptor);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('IndexedDB catalogue transaction aborted.'));
    tx.onerror = (event) => event.preventDefault();
  });
}
function databaseName(config: ICamaConfig): string {
  if (config.persistenceAdapter !== 'indexeddb') throw new Error('IndexedDB catalogue requires IndexedDB persistence.');
  return config.path || 'cama';
}
export async function describeCollection(config: ICamaConfig, name: string): Promise<CollectionDescriptor | undefined> {
  catalogueName(name);
  const db = await openExisting(databaseName(config));
  if (!db) return undefined;
  try {
    return db.objectStoreNames.contains(name) ? await readMetadata(db, name) : undefined;
  } finally {
    db.close();
  }
}
export async function listCollections(
  config: ICamaConfig,
  options: CollectionListOptions = {},
): Promise<CollectionListPage> {
  const limit = catalogueLimit(options);
  const db = await openExisting(databaseName(config));
  if (!db) return { collections: [] };
  try {
    if (db.objectStoreNames.length > 10000) throw new Error('Catalogue discovery is limited to 10,000 object stores.');
    const names = Array.from(db.objectStoreNames)
      .filter((name) => options.after === undefined || name > options.after)
      .sort();
    const collections: CollectionDescriptor[] = [];
    for (const name of names) {
      catalogueName(name);
      const descriptor = await readMetadata(db, name);
      if (!descriptor) continue;
      if (collections.length === limit) return { collections, nextCursor: collections[collections.length - 1].name };
      collections.push(descriptor);
    }
    return { collections };
  } finally {
    db.close();
  }
}
