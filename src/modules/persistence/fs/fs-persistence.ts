import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { inject, injectable } from 'inversify';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { TYPES } from '../../../types';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';
import { IPaging } from '../../../interfaces/paging.interface';
import { IPagingAllocation } from '../../../interfaces/paging-allocation.interface';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import * as path from 'path';
import sift from 'sift';
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
    const outputPath = path.join(process.cwd(), this.config.path, this.collectionName);
    console.log('loading files', outputPath);
    console.time('files loaded');
    const files = await this.fs.readDir(outputPath);
    const promises = [];
    const data: any = {  };
    if(this.cache){
      return this.cache;
    }
    for (const file of files) {
      console.log(file, ['meta.json', 'paging.json'].indexOf(file))
      if(['meta.json', 'paging.json'].indexOf(file) !== -1){
        console.log('continuing')
        continue;
      }

      promises.push(this.queue.add(() => (async (file) => {
        const filePath =  path.join(outputPath, file);
        const page = await this.fs.loadPage(filePath);
        data[file] = page;
      })(file)));
    }
    await Promise.all(promises);
    console.timeEnd('files loaded');
    this.cache = data;
    return data;
  }
  async update(query: any, delta: any): Promise<void> {
    const data = await this.getData();
    const promises = [];
    for (const page in  data){
      const updated = data[page].filter(sift(query));
      if(updated.length > 0) {
        obop.update(updated, delta);
        promises.push(
          this.queue.add(async () => {
            await this.fs.writePage(page, this.config.path, this.collectionName, data[page]);
          })
        );
      }

    }
    await Promise.all(promises);
  }


}
