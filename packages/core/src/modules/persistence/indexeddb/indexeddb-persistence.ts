import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IPersistenceAdapter, RecordMutation } from '../../../interfaces/persistence-adapter.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { assertMutationBound, chunkRecords } from '../record-pages';
import { readStoragePayload } from '../storage-version';
import { IndexedDbDatabaseCoordinator } from './database-coordinator';

interface StoreMetadata {
  camaDB: { format: 'records'; version: 3 };
  generation: number;
  nextSequence: number;
}
interface StoredRecord {
  deleted?: boolean;
  generation: number;
  sequence: number;
  value?: any;
}

const METADATA_KEY = 'record-metadata';
const RECORD_PREFIX = 'record:';
const emptyMetadata = (): StoreMetadata => ({
  camaDB: { format: 'records', version: 3 },
  generation: 0,
  nextSequence: 0,
});

/** IndexedDB record store using native keys and one transaction per bounded batch. */
export default class IndexedDbPersistence implements IPersistenceAdapter {
  private readonly dbName: string;
  private destroyed = false;
  private readonly storeName: string;
  private readonly initPromise: Promise<void>;

  constructor(
    private config: ICamaConfig,
    private logger: ILogger,
    private collectionName: string,
  ) {
    this.dbName = this.config.path || 'cama';
    this.storeName = collectionName;
    this.initPromise = IndexedDbDatabaseCoordinator.ensureStore(this.dbName, this.storeName)
      .then(() => this.initializeRecords())
      .catch((error) => {
        throw this.contextualError('initialize', error);
      });
  }

  async insert(rows: any[]): Promise<void> {
    await this.mutateRecords({ puts: rows });
  }

  async getData(): Promise<any[]> {
    const records: Array<{ sequence: number; value: any }> = [];
    for await (const record of this.iterateStoredRecords()) {
      if (!record.deleted) records.push({ sequence: record.sequence, value: record.value });
    }
    return records.sort((left, right) => left.sequence - right.sequence).map((record) => record.value);
  }

  async getRecord(id: string): Promise<any | undefined> {
    this.checkDestroyed();
    await this.initPromise;
    const record = (await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) =>
      db.transaction(this.storeName).objectStore(this.storeName).get(this.recordKey(id)),
    )) as StoredRecord | undefined;
    return record?.deleted ? undefined : record?.value;
  }

  async getRecords(ids: string[]): Promise<Map<string, any>> {
    this.checkDestroyed();
    await this.initPromise;
    return IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
      const store = db.transaction(this.storeName).objectStore(this.storeName);
      const records = new Map<string, any>();
      for (const id of ids) {
        const record = (await store.get(this.recordKey(id))) as StoredRecord | undefined;
        if (record && !record.deleted) records.set(id, record.value);
      }
      return records;
    });
  }

  async *iterateRecords(): AsyncIterable<any> {
    const records: Array<{ sequence: number; value: any }> = [];
    for await (const record of this.iterateStoredRecords()) {
      if (!record.deleted) records.push({ sequence: record.sequence, value: record.value });
    }
    records.sort((left, right) => left.sequence - right.sequence);
    for (const record of records) yield record.value;
  }

  async mutateRecords(mutation: RecordMutation): Promise<void> {
    this.checkDestroyed();
    await this.initPromise;
    assertMutationBound(Math.max(mutation.deletes?.length ?? 0, mutation.puts?.length ?? 0));
    chunkRecords(mutation.puts ?? []);
    try {
      await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metadata = (await store.get(METADATA_KEY)) as StoreMetadata;
        const generation = metadata.generation + 1;
        for (const id of mutation.deletes ?? []) {
          const previous = (await store.get(this.recordKey(id))) as StoredRecord | undefined;
          if (previous && !previous.deleted) {
            await store.put({ deleted: true, generation, sequence: previous.sequence }, this.recordKey(id));
          }
        }
        for (const [index, row] of (mutation.puts ?? []).entries()) {
          const id = typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`;
          const previous = (await store.get(this.recordKey(id))) as StoredRecord | undefined;
          const sequence = previous?.sequence ?? metadata.nextSequence++;
          await store.put({ generation, sequence, value: row }, this.recordKey(id));
        }
        await store.put({ ...metadata, generation }, METADATA_KEY);
        await tx.done;
      });
    } catch (error) {
      throw this.contextualError('mutate records', error);
    }
  }

  async update(updated: any[]): Promise<void> {
    this.checkDestroyed();
    if (!Array.isArray(updated)) {
      const error = new Error('Collection replacement must be an array');
      error.name = 'DataCloneError';
      throw this.contextualError('update', error);
    }
    assertMutationBound(updated.length);
    chunkRecords(updated);
    await this.initPromise;
    try {
      await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metadata = (await store.get(METADATA_KEY)) as StoreMetadata;
        const generation = metadata.generation + 1;
        for (const key of await store.getAllKeys()) {
          if (typeof key === 'string' && key.startsWith(RECORD_PREFIX)) await store.delete(key);
        }
        for (const [index, row] of updated.entries()) {
          const id = typeof row?._id === 'string' ? row._id : `legacy-${generation}-${index}-${this.nonce()}`;
          await store.put({ generation, sequence: index, value: row }, this.recordKey(id));
        }
        await store.put({ ...metadata, generation, nextSequence: updated.length }, METADATA_KEY);
        await tx.done;
      });
    } catch (error) {
      throw this.contextualError('update', error);
    }
  }

  async compact(): Promise<void> {
    this.checkDestroyed();
    await this.initPromise;
    await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const key of await store.getAllKeys()) {
        if (typeof key !== 'string' || !key.startsWith(RECORD_PREFIX)) continue;
        const record = (await store.get(key)) as StoredRecord;
        if (record.deleted) await store.delete(key);
      }
      await tx.done;
    });
  }

  async destroy(): Promise<void> {
    try {
      await this.initPromise;
      await IndexedDbDatabaseCoordinator.deleteStore(this.dbName, this.storeName);
      this.destroyed = true;
    } catch (error) {
      throw this.contextualError('destroy', error);
    }
  }

  private async initializeRecords(): Promise<void> {
    await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      if (await store.get(METADATA_KEY)) return;
      const existing = readStoragePayload(await store.get('data'));
      if (existing.length > 0) {
        throw new Error(`Collection "${this.collectionName}" requires explicit migration to record storage`);
      }
      await store.put(emptyMetadata(), METADATA_KEY);
      await tx.done;
    });
  }

  private async *iterateStoredRecords(): AsyncIterable<StoredRecord> {
    this.checkDestroyed();
    await this.initPromise;
    const records = await IndexedDbDatabaseCoordinator.run(this.dbName, async (db) => {
      const store = db.transaction(this.storeName).objectStore(this.storeName);
      const values: StoredRecord[] = [];
      let cursor = await store.openCursor(IDBKeyRange.bound(RECORD_PREFIX, `${RECORD_PREFIX}\uffff`));
      while (cursor) {
        values.push(cursor.value as StoredRecord);
        cursor = await cursor.continue();
      }
      return values;
    });
    for (const record of records) yield record;
  }

  private recordKey(id: string): string {
    return `${RECORD_PREFIX}${id}`;
  }
  private nonce(): string {
    return Math.random().toString(36).slice(2, 10);
  }
  private checkDestroyed(): void {
    if (this.destroyed) throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate');
  }
  private contextualError(operation: string, error: unknown): Error {
    const reason = error instanceof Error && error.name ? error.name : 'IndexedDBError';
    return new Error(
      `IndexedDB ${operation} failed for database "${this.dbName}", collection "${this.collectionName}": ${reason}`,
    );
  }
}
