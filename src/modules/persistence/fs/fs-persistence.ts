import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';
import { IPaging } from '../../../interfaces/paging.interface';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import * as path from 'path';
import sift from 'sift';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';

const obop = require('obop')();

@injectable()
export default class FSPersistence implements IPersistenceAdapter {

  queue = new PQueue({ concurrency: 50 });
  private collectionName = '';
  private cache: any = null;
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.Paging) private paging: IPaging<any>,
    @inject(TYPES.FS) private fs: IFS,
    @inject(TYPES.Logger) private logger:ILogger
  ) {}

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
    await this.paging.init(name, config);
  }

  /**
   * Insert rows into pages via the persistence adapter
   * @param rows - The rows to be inserted
   */
  async insert<T>(rows: Array<any>): Promise<any> {
    this.cache = null;
    return this.queue.add(async () => {
      const allocations = await this.paging.allocate(rows);
      const outputPath = path.join(process.cwd(), this.config.path);
      const filePaths = await this.fs.writePages(outputPath, this.collectionName, allocations);
      await this.fs.commitPages(filePaths);
      await this.paging.commit();
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

    const outputPath = path.join(process.cwd(), this.config.path, this.collectionName);

    const files = await this.fs.readDir(outputPath);
    const promises = [];
    const data: any = {  };

    for (const file of files) {
      if(['meta.json', 'paging.json'].indexOf(file) !== -1){
        continue;
      }

      promises.push(this.queue.add(() => (async (file) => {
        const filePath =  path.join(outputPath, file);
        this.logger.log(LogLevel.Debug, "Loading page");
        const pointer = this.logger.startTimer();
        const page = await this.fs.loadPage(filePath);
        this.logger.endTimer(LogLevel.Perf, pointer, `Loading page - ${filePath}`);
        data[file] = page;
      })(file)));
    }
    await Promise.all(promises);
    this.logger.log(LogLevel.Info, "Updating cache");
    this.cache = data;
    return data;
  }
  async update(query: any, delta: any): Promise<void> {
    const data = await this.getData();
    const promises = [];
    this.logger.log(LogLevel.Debug, "Iterating pages");
    for (const page in  data){
      this.logger.log(LogLevel.Debug, `Sifting - ${page}`);
      const siftPointer = this.logger.startTimer();
      const updated = data[page].filter(sift(query));
      this.logger.endTimer(LogLevel.Perf, siftPointer, 'Sifting data');
      if(updated.length > 0) {
        this.logger.log(LogLevel.Debug, `Updating sifted`);
        const updatePointer = this.logger.startTimer();
        obop.update(updated, delta);
        this.logger.endTimer(LogLevel.Perf, updatePointer, 'Update sifted');
        promises.push(
          this.queue.add(async () => {
            this.logger.log(LogLevel.Debug, `Writing page`);

            await this.fs.writePage(page, this.config.path, this.collectionName, data[page]);
          })
        );
      }

    }
    await Promise.all(promises);
  }


}
