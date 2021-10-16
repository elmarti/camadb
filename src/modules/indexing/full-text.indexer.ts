import { IIndexer } from '../../interfaces/indexer.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { ICamaConfig } from '../../interfaces/cama-config.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';
import PQueue from 'p-queue';
import {Index} from  'flexsearch';
import { IndexEnum } from '../../interfaces/index.enum';

@injectable()
export class FullTextIndexer implements IIndexer {

  queue = new PQueue({ concurrency: 1 });
  private enabled = false;
  private fields:Array<string> = [];
  private indexInstance = new Index()
  constructor(@inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
  ) {
    this.queue.add(() => (async () =>{
      const collectionMeta = await this.collectionMeta.get();
      console.log('initting ft', collectionMeta)
      const indexes = collectionMeta?.indexes.filter(x => x.index === IndexEnum.FullText);
      if(indexes && indexes.length > 0){
        this.enabled = true;
        this.fields = indexes.map(idx => idx.column);
      }
    })())
  }
  async addMetaData(dataset: Array<any>, rows: Array<any>): Promise<Array<any>> {
    return [];
  }

  async index(rows: Array<any>): Promise<any> {
    console.log('ft indexing', this.enabled, this.fields);
    if(!this.enabled){
      return;
    }
    await this.queue.add(() => (async (rows) => {
      await rows.map(async row => {
        for(const field of this.fields){
          await this.indexInstance.add(row.$$camaMeta.camaIndex, row[field]);
        }
      });
    })(rows));
    console.log(this.indexInstance);
  }
  async search(query: any): Promise<Array<any>> {
    return this.indexInstance.search(query);
  }
}