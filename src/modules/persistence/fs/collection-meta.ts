import { inject, injectable } from 'inversify';
import * as path from 'path';
import PQueue from 'p-queue';
import { TYPES } from '../../../types';
import { IFS } from '../../../interfaces/fs.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';

@injectable()
export class CollectionMeta implements ICollectionMeta {
  queue = new PQueue({ concurrency: 1 });
  private meta?: IMetaStructure;
  private dbPath?: string;
  private fileName?: string;
  private collectionName?: string;
  private camaPath?: string;
  constructor(@inject(TYPES.FS) private fs: IFS, @inject(TYPES.CamaConfig) private config: ICamaConfig) {}
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    this.camaPath =  path.join(process.cwd(), './.cama');
    this.dbPath = path.join(this.camaPath, collectionName);
    this.fileName = `meta.json`;
    this.collectionName = collectionName;
    if ((!await this.fs.exists(this.camaPath))) {
      await this.fs.mkdir(path.join(this.camaPath));
    }
    if (await this.fs.exists(path.join(this.dbPath, this.fileName))) {
      return;
    }

    await this.fs.mkdir(path.join(this.dbPath));
    this.meta = {
      ...config,
      collectionName,
    };
    console.log('calling with dbPath collcetion meta init', this.dbPath);
    return this.fs.writeJSON<IMetaStructure>(this.dbPath, this.fileName, this.meta);
  }

  async update(collectionName: string, metaStructure: IMetaStructure): Promise<void> {
    const dbPath = this.config.path || path.join(process.cwd(), './.cama', collectionName);
    this.meta = metaStructure;
    await this.queue.add(() => {
      this.meta = Object.assign({}, this.meta, metaStructure);
      console.log('calling with dbPath collection meta update', dbPath);
      return this.fs.writeJSON<IMetaStructure>(dbPath, 'meta.json', this.meta);
    });
  }

  async get(): Promise<IMetaStructure|undefined> {
    return this.meta;
  }
}
