import { inject, injectable } from 'inversify';
import { IPaging } from '../../../interfaces/paging.interface';
import { IPagingAllocation } from '../../../interfaces/paging-allocation.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IMetaStructure } from '../../../interfaces/meta-structure.interface';
import { TYPES } from '../../../types';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IPage } from '../../../interfaces/page.interface';
import { IPagingMap } from '../../../interfaces/paging-map.interface';
import PQueue from 'p-queue';
import { batchArray } from '../../../util/batch-array';

@injectable()
export class FsPaging<T> implements IPaging<T> {
  queue = new PQueue({ concurrency: 1 });

  private dbPath: any;
  private fileName = '';
  private collectionName = '';
  private paging: IPagingMap = {
    freePages: [],
  };
  private allocation?: Array<IPagingAllocation<T>>;
  private collectionFolder?: string;
  constructor(@inject(TYPES.FS) private fs: IFS, @inject(TYPES.CamaConfig) private config: ICamaConfig) {}
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    this.dbPath = path.join(process.cwd(), './.cama');
    this.fileName = `paging.json`;
    this.collectionName = collectionName;
    this.collectionFolder = path.join(this.dbPath, this.collectionName);
    const filePath = path.join(this.collectionFolder, this.fileName);
    if (await this.fs.exists(filePath)) {
      this.paging = await this.fs.loadJSON<IPagingMap>(filePath);
      return;
    }
    console.log('initialising paging wth  db  path', this.dbPath);
    return this.fs.writeJSON<any>(this.collectionFolder, this.fileName, { freePages: [] });
  }

  async allocate(rows: Array<T>): Promise<Array<IPagingAllocation<T>>> {
    const rowCopy = [...rows];
    const allocation: Array<IPagingAllocation<T>> = [];
    if (this.paging.freePages.length > 0) {
      for (const freePage of this.paging.freePages) {
        const page = this.paging[freePage];
        const freeSpace = this.config.pageLength - page.quantity;
        const newAllocation = {
          pageKey: freePage,
          rows: rowCopy.splice(0, freeSpace),
        };
        this.paging[freePage].quantity += rows.length;
        if (this.paging[freePage].quantity >= this.config.pageLength) {
          this.paging.freePages = this.paging.freePages.filter((x: string) => x !== freePage);
        }
        allocation.push(newAllocation);
      }
    }
    if (rowCopy.length > 0) {
      allocation.push(
        ...batchArray<T>(rowCopy).map((row) => {
          const pageKey = uuidv4();
          if (row.length < this.config.pageLength) {
            this.paging.freePages.push(pageKey);
          }
          console.log('rows in page', row.length);
          if (!this.paging[pageKey]) {
            this.paging[pageKey] = {
              quantity: row.length,
            };
          } else {
            this.paging[pageKey].quantity = this.paging[pageKey].quantity + row.length;
          }
          return {
            rows: row,
            pageKey,
            new: true,
          };
        }, this.config.pageLength),
      );
    }
    console.log(`Created ${allocation.length} Allocations`);
    this.allocation = allocation;
    return allocation;
  }
  async commit(): Promise<void> {
    console.log('calling with dbPath commit', this.dbPath);
    await this.fs.writeJSON<IPagingMap>(this.collectionFolder ||"", this.fileName, this.paging);
  }
}
