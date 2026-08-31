import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { IndexedDbDatabaseCoordinator } from './database-coordinator';

export default class IndexedDbPersistence implements IPersistenceAdapter{
  private dbName = "";
  private destroyed = false;
  private storeName = "";
  private cache: any = null;
  private initPromise: Promise<void> | null = null;
  constructor(
    private config: ICamaConfig,
    private logger:ILogger,
    private collectionName: string
  ) {
      this.dbName = this.config.path || 'cama';
      this.storeName = collectionName;
      this.initPromise = IndexedDbDatabaseCoordinator.ensureStore(this.dbName, this.storeName)
        .catch(error => { throw this.contextualError('initialize', error); });
  }
  async destroy(): Promise<void> {
    try {
      await this.initPromise;
      await IndexedDbDatabaseCoordinator.deleteStore(this.dbName, this.storeName);
      this.cache = null;
      this.destroyed = true;
    } catch (error) {
      throw this.contextualError('destroy', error);
    }
  }
  async update(updated:any): Promise<void> {
    try {
      this.checkDestroyed();
      await this.initPromise;
      await IndexedDbDatabaseCoordinator.run(this.dbName, async db => {
        const tx = db.transaction(this.storeName, 'readwrite');
        await tx.objectStore(this.storeName).put(updated, 'data');
        await tx.done;
      });
      this.cache = updated;
    } catch (error) {
      throw this.contextualError('update', error);
    }
  }
  async getData(): Promise<any> {
    try {
      this.checkDestroyed();
      await this.initPromise;
      if(this.cache !== null) return this.cache;
      this.cache = await IndexedDbDatabaseCoordinator.run(this.dbName, async db =>
        db.transaction(this.storeName).objectStore(this.storeName).get('data')
      );
      return this.cache;
    } catch (error) {
      throw this.contextualError('read', error);
    }
  }
  async insert(rows: Array<any>): Promise<any> {
    try {
      this.checkDestroyed();
      await this.initPromise;
      this.cache = await IndexedDbDatabaseCoordinator.run(this.dbName, async db => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const data = (await store.get('data')) || [];
        data.push(...rows);
        await store.put(data, 'data');
        await tx.done;
        return data;
      });
    } catch (error) {
      throw this.contextualError('insert', error);
    }
  }

  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }

  private contextualError(operation: string, error: unknown): Error {
    // Error messages supplied by the platform are deliberately not forwarded:
    // some implementations may describe the value which failed to clone.
    const reason = error instanceof Error && error.name ? error.name : 'IndexedDBError';
    return new Error(`IndexedDB ${operation} failed for database "${this.dbName}", collection "${this.collectionName}": ${reason}`);
  }
}
