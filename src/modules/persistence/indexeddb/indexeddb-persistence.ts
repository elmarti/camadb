import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { IDBPDatabase, openDB } from 'idb';

@injectable()
export default class IndexedDbPersistence implements IPersistenceAdapter{
  private db?: IDBPDatabase;
  private dbName? = "";
  private destroyed = false;
  private storeName = "";
  private cache: any = null;
  private initPromise: Promise<void> | null = null;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CollectionName) private collectionName: string
  ) {
      this.dbName = this.config.path || 'cama';
      this.storeName = collectionName;
      this.initPromise = openDB(this.dbName, 1, {
        upgrade: async (db: IDBPDatabase) => {
          if (!db.objectStoreNames.contains(collectionName)) {
            const store = db.createObjectStore(collectionName);
            store.put([], 'data');
          }
          await this.getData()
        }
      }
    ).then(db => {
      this.db = db; 
    });
  }
  async destroy(): Promise<void> {
    this.db?.deleteObjectStore(this.storeName);
    this.cache = null;
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    await this.initPromise;

    const tx = this.db?.transaction(this.storeName, 'readwrite');
    const store = tx?.objectStore(this.storeName) as any;
    await store?.put(updated, 'data');
    await tx?.done;


  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    await this.initPromise;

      if(this.cache){
        return this.cache
      }
      const store = this.db?.transaction(this.storeName).objectStore(this.storeName);
      this.cache = await store?.get('data');

      return this.cache;

  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    await this.initPromise;

      const data = await this.getData();
      data.push(...rows);
      const tx = this.db?.transaction(this.storeName, 'readwrite');
      const store = tx?.objectStore(this.storeName) as any;
      await store?.put(data, 'data');
      this.cache = data;

  }

  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}
