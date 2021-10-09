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

const obop = require('obop')();

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
    @inject(TYPES.Logger) private logger:ILogger
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
    console.log('initting collection');
    await this.collectionMeta.init(name, config);
    console.log('meta initialised');


  }

  /**
   * Insert rows into pages via the persistence adapter
   * @param rows - The rows to be inserted
   */
  async insert<T>(rows: Array<any>): Promise<any> {
    return await this.queue.add(async () => {
      console.log('allocating');
      console.log('allocated');
      const outputPath = path.join(process.cwd(), this.outputPath);
      const data = [...(await this.getData()), ...rows];
      await this.fs.writeData(outputPath, this.collectionName, data);
      await this.fs.commit(outputPath, this.collectionName);
      this.cache = null;
    });
  }

  /**
   * Load the data from either the cache or the pages
   */
  async getData<T>(): Promise<any> {
    this.logger.log(LogLevel.Info, "Loading data");
    if(this.cache){
      this.logger.log(LogLevel.Info, "Loading data from cache");
      return this.cache;
    }
    this.logger.log(LogLevel.Info, "Loading data from disk");

    const outputPath = path.join(process.cwd(), this.outputPath , this.collectionName, 'data');

    const data = await this.fs.readData(outputPath);

    this.cache = data;
    return data;
  }
  async update(query: any, delta: any): Promise<void> {
    const data = await this.getData();
    const promises = [];
    this.logger.log(LogLevel.Debug, "Iterating pages");
    const siftPointer = this.logger.startTimer();
    const updated = data.filter(sift(query));
    this.logger.endTimer(LogLevel.Perf, siftPointer, 'Sifting data');
    if(updated.length > 0) {
      this.logger.log(LogLevel.Debug, `Updating sifted`);
      const updatePointer = this.logger.startTimer();
      obop.update(updated, delta);
      this.logger.endTimer(LogLevel.Perf, updatePointer, 'Update sifted');
      await this.queue.add(async () => {
          this.logger.log(LogLevel.Debug, `Writing page`);
          await this.fs.writeData(this.outputPath, this.collectionName, data);
        })
    }
  }


}
