import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { inject } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { IDBPDatabase, openDB } from 'idb';
import PQueue from 'p-queue';

export default class IndexedDbPersistence implements IPersistenceAdapter{
  private db?: IDBPDatabase;
  queue = new PQueue({ concurrency: 1 });
  private dbName? = "";
  private destroyed = false;
  private storeName = "";
  private cache: any;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger
  ) {

  }
  async destroy(): Promise<void> {
    this.db?.deleteObjectStore(this.storeName);
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    const tx = this.db?.transaction(this.storeName);
    const store = tx?.objectStore(this.storeName) as any;
    await store?.put('data', updated);
    await tx?.done;
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
    if(this.cache){
      return this.cache
    }
    const store = await this.db?.transaction(this.storeName).objectStore(this.storeName);
    this.cache = await store?.get('data');
    return this.cache;
  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    await this.queue.add(async () => {
      const data = await this.getData();
      data.push(...rows);
      await this.db?.put('data', data);
    });

  }
  async initCollection(name: string, config: ICollectionConfig): Promise<void> {
    this.dbName = this.config.path || 'cama';
    this.storeName = name;
    this.db = await openDB(this.dbName, 1, {
      upgrade(db: IDBPDatabase) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
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
