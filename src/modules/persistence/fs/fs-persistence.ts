import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import * as path from 'path';
import sift from 'sift';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';
import { IIndexer } from '../../../interfaces/indexer.interface';


@injectable()
export default class FSPersistence implements IPersistenceAdapter {


  queue = new PQueue({ concurrency: 1 });
  private collectionName = '';
  private cache: any = null;
  private outputPath: string;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.FS) private fs: IFS,
    @inject(TYPES.Logger) private logger:ILogger,
    @inject(TYPES.CamaIndexer) private camaIndexer:IIndexer

  ) {
    this.outputPath = this.config.path || '.cama'
  }

  /**
   * Initialise the persistence adapter
   * @private
   * @remarks Internal method - don't call it
   * @param name - The name of the collection
   * @param config - The collection config
   */
  async initCollection(name: string, config: ICollectionConfig): Promise<void> {
    this.collectionName = name;
    await this.collectionMeta.init(name, config);
  }

  /**
   * Insert rows into pages via the persistence adapter
   * @param rows - The rows to be inserted
   */
  async insert<T>(rows: Array<any>): Promise<any> {
    return await this.queue.add(async () => {
      const outputPath = path.join(process.cwd(), this.outputPath);
      const oldData = await this.getData();
      console.time('indexing');
      const indexedData = await this.camaIndexer.addMetaData(oldData, rows);
      console.timeEnd('indexing');
      const data = [...oldData, ...indexedData];

      await this.fs.writeData(outputPath, this.collectionName, data);
      await this.fs.commit(outputPath, this.collectionName);
      this.cache = null;
    });
  }

  /**
   * Load the data from either the cache or the pages
   */
  async getData<T>(): Promise<any> {
    const meta = await this.collectionMeta.get();
    const dateColumns:any = [];
    // @ts-ignore
    if(meta.columns && meta.columns.length > 0){
      // @ts-ignore
      for(const col of meta.columns){
        if(['date', 'datetime'].indexOf(col.type) > -1){
          dateColumns.push(col.title);
        }
      }

    }
    this.logger.log(LogLevel.Info, "Loading data");
    if(this.cache){
      this.logger.log(LogLevel.Info, "Loading data from cache");
      return this.cache;
    }
    this.logger.log(LogLevel.Info, "Loading data from disk");

    const outputPath = path.join(process.cwd(), this.outputPath , this.collectionName, 'data');

    const data:any = await this.fs.readData(outputPath);

    this.cache = data.map((row:any) => {
      for(const dateColumn of dateColumns){
        row[dateColumn] = new Date(row[dateColumn]);
      }

      return row;
    });

    return this.cache;
  }
  async update(updated:any): Promise<void> {


      await this.queue.add(async () => {
          this.logger.log(LogLevel.Debug, `Writing file`);
          await this.fs.writeData(this.outputPath, this.collectionName, updated);
        })

  }

  /**
   * Destroy the collection within the persistence adapter
   */
  async destroy(): Promise<void> {
    await this.fs.rmDir(this.outputPath, this.collectionName);
    this.cache = null;
  }

}
