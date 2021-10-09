import { inject, injectable } from 'inversify';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../../types';
import { IFS } from '../../../interfaces/fs.interface';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { IPagingMap } from '../../../interfaces/paging-map.interface';
import PQueue from 'p-queue';
import { batchArray } from '../../../util/batch-array';
import { IPaging } from '../../../interfaces/paging.interface';
import { IPagingAllocation } from '../../../interfaces/paging-allocation.interface';
import { ICollectionConfig } from '../../../interfaces/collection-config.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { LogLevel } from '../../../interfaces/logger-level.enum';

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
  constructor(@inject(TYPES.FS) private fs: IFS, @inject(TYPES.CamaConfig) private config: ICamaConfig,
              @inject(TYPES.Logger) private logger:ILogger) {}

  /**
   * Initialise the pager
   * @private
   * @remarks Internal method - don't call it
   * @param collectionName - The name of the collection
   * @param config - The collection config
   */
  async init(collectionName: string, config: ICollectionConfig): Promise<void> {
    this.dbPath = path.join(process.cwd(), './.cama');
    this.fileName = `paging.json`;
    this.collectionName = collectionName;
    this.collectionFolder = path.join(this.dbPath, this.collectionName);
    const filePath = path.join(this.collectionFolder, this.fileName);
    this.logger.log(LogLevel.Info, 'checking if paging file exists');
    if (await this.fs.exists(filePath)) {
      this.logger.log(LogLevel.Info, 'already exists');
      this.paging = await this.fs.loadJSON<IPagingMap>(filePath);
      return;
    }
    this.logger.log(LogLevel.Info, 'creating paging file');
    return this.fs.writeJSON<any>(this.collectionFolder, this.fileName, { freePages: [] });
  }

  /**
   * construct an allocation plan for the pages
   * @param rows - The rows to be allocated
   */
  async allocate(rows: Array<T>): Promise<Array<IPagingAllocation<T>>> {
    this.logger.log(LogLevel.Info, 'allocating pages');

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
    this.allocation = allocation;
    return allocation;
  }

  /**
   * Overwrite the paging file with the in-memory dataset
   */
  async commit(): Promise<void> {
    this.logger.log(LogLevel.Info, 'committing paging file');
    await this.fs.writeJSON<IPagingMap>(this.collectionFolder ||"", this.fileName, this.paging);
  }

  /**
   * rewrite pages with new data
   * @param data
   */
  async rewrite(data: any): Promise<void> {
    return Promise.resolve(undefined);
  }
}
