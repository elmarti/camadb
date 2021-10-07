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
import { ISerializer } from '../../../interfaces/serializer.interface';

@injectable()
export default class FSPersistence implements IPersistenceAdapter {
  queue = new PQueue({ concurrency: 50 });
  private collectionName = '';
  constructor(
    @inject(TYPES.CamaConfig) private config: ICamaConfig,
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.Paging) private paging: IPaging<any>,
    @inject(TYPES.FS) private fs: IFS,
  ) {}
  async initCollection(name: string, config: ICollectionConfig): Promise<void> {
    this.collectionName = name;
    await this.collectionMeta.init(name, config);
    await this.paging.init(name, config);
  }

  async insert<T>(rows: Array<any>): Promise<any> {
    return this.queue.add(async () => {
      const allocations = await this.paging.allocate(rows);
      const outputPath = path.join(process.cwd(), this.config.path);
      const filePaths = await this.fs.writePages(outputPath, this.collectionName, allocations);
      await this.fs.commitPages(filePaths);
      await this.paging.commit();
    });
  }
  async getData<T>(): Promise<Array<T>> {
    const outputPath = path.join(process.cwd(), this.config.path, this.collectionName);
    console.log('loading files', outputPath);
    console.time('files loaded');
    const files = await this.fs.readDir(outputPath);
    const promises = [];
    const data: Array<T> = [];
    for (const file of files) {
      console.log(file, ['meta.json', 'paging.json'].indexOf(file))
      if(['meta.json', 'paging.json'].indexOf(file) !== -1){
        console.log('continuing')
        continue;
      }
      promises.push(this.queue.add(() => (async (file) => {
        const filePath =  path.join(outputPath, file);
        const page = await this.fs.loadPage(filePath);
        data.push(...page);
      })(file)));
    }
    await Promise.all(promises);
    console.timeEnd('files loaded');

    return data;
  }
}
