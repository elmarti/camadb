import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../types';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';

import { ILogger } from '../../../interfaces/logger.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';

@injectable()
export default class LocalstoragePersistence implements IPersistenceAdapter{
  private readonly dbName;
  private destroyed = false;
  private cache: any = null;
  private indexes = new Map();
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CollectionName) private collectionName: string,
    @inject(TYPES.CollectionConfig) private collectionConfig: ICollectionConfig,
  ) {
    this.dbName = this.config.path || 'cama';
    this.initIndexes();
    this.getData();

  }
  private async initIndexes(): Promise<void> {
    for (const index of this.collectionConfig.indexes) {
      const indexData = await this.loadIndex(index.column);
      this.indexes.set(index.column, indexData);
    }
  }
  public getIndex(column: string): Map<any, number> {
    return this.indexes.get(column);
  }
  private async loadIndex(column: string): Promise<Map<any, number>> {
    //@ts-ignore
    const rawData = await window.localStorage.getItem(`${this.dbName}-${this.collectionName}-index-${column}`);
    const data = rawData ? JSON.parse(rawData) : [];
    return new Map(data);
  }
  
  private async saveIndex(column: string): Promise<void> {
    const indexData = this.indexes.get(column);
    if (indexData) {
      const data = Array.from(indexData.entries());
      //@ts-ignore
      await window.localStorage.setItem(`${this.dbName}-${this.collectionName}-index-${column}`, JSON.stringify(data));
    }
  }
  
  private updateIndexes(row: any, index: number): void {
    for (const indexConfig of this.collectionConfig.indexes) {
      const columnIndex = this.indexes.get(indexConfig.column);
      if (columnIndex) {
        columnIndex.set(row[indexConfig.column], index);
      }
    }
  }
  
  async destroy(): Promise<void> {
    //@ts-ignore
    window.localStorage.removeItem(`${this.dbName}-${this.collectionName}-data`);
    this.destroyed = true;
  }
  async update(updated:any): Promise<void> {
    this.checkDestroyed();
    await this.setData(updated);
    //@ts-ignore
  }
  async getData(): Promise<any> {
    this.checkDestroyed();
      if(this.cache){
        return this.cache
      }
      this.cache = await this.loadData();

      return this.cache;

  }
  async insert(rows: Array<any>): Promise<any> {
    this.checkDestroyed();
    const data = await this.getData();
    for (const row of rows) {
      const index = data.length;
      data.push(row);
      this.updateIndexes(row, index);
    }
    await this.setData(data);
  
    // Save the updated indexes
    for (const indexConfig of this.collectionConfig.indexes) {
      await this.saveIndex(indexConfig.column);
    }
  }
  private async loadData(){
    //@ts-ignore
    const result = await window.localStorage.getItem(`${this.dbName}-${this.collectionName}-data`);
    if(!result){
      return [];
    }
    return JSON.parse(result);
  }

  private async setData(data:any){
    //@ts-ignore

    await window.localStorage.setItem(`${this.dbName}-${this.collectionName}-data`, JSON.stringify(data));

  }

  private checkDestroyed(){
    if(this.destroyed){
      throw new Error('Collection has been destroyed. Call Cama.initCollection to recreate')
    }
  }
}
