import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { IDBPDatabase, openDB } from 'idb';
import PQueue from 'p-queue';

@injectable()
export default class IndexedDbPersistence implements IPersistenceAdapter{
  private db?: IDBPDatabase;
  queue = new PQueue({ concurrency: 1 });
  private dbName? = "";
  private destroyed = false;
  private storeName = "";
  private cache: any = null;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger
  ) {

  }
  async destroy(): Promise<void> {
    this.db?.deleteObjectStore(this.storeName);
    this.cache = null;
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    const tx = this.db?.transaction(this.storeName, 'readwrite');
    const store = tx?.objectStore(this.storeName) as any;
    await store?.put(updated, 'data');
    await tx?.done;
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    if(this.cache){
      return this.cache
    }
    const store = this.db?.transaction(this.storeName).objectStore(this.storeName);
    this.cache = await store?.get('data');

    return this.cache;
  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    await this.queue.add(async () => {
      const data = await this.getData();
      data.push(...rows);
      const tx = this.db?.transaction(this.storeName, 'readwrite');
      const store = tx?.objectStore(this.storeName) as any;
      await store?.put(data, 'data');
      this.cache = data;
    });

  }
  async initCollection(name: string, config: ICollectionConfig): Promise<void> {
    this.dbName = this.config.path || 'cama';
    this.storeName = name;
    this.db = await openDB(this.dbName, 1, {
      upgrade: async (db: IDBPDatabase) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name);
            store.put([], 'data');
          }
        }
      }
    );
  }
  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}