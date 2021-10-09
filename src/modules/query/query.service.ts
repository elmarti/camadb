import { IQueryService } from '../../interfaces/query-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from "sift";
import { sort } from 'fast-sort';

import { IQueryOptions } from '../../interfaces/query-options.interface';
import { ILogger } from '../../interfaces/logger.interface';
import { IFilterResult } from '../../interfaces/filter-result.interface';
import { ICamaConfig } from '../../interfaces/cama-config.interface';
import { ICollectionMeta } from '../../interfaces/collection-meta.interface';

@injectable()
export class QueryService<T> implements IQueryService<T>{
  private dateColumns = [];
  constructor(
    @inject(TYPES.CollectionMeta) private collectionMeta: ICollectionMeta,
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
              @inject(TYPES.Logger) private logger:ILogger) {

  }

  /**
   * Handle filtering of queries
   * @param query - The query to be applied to the dataset
   * @param options - Options for further data manipulation
   */
  async filter(query: any = {}, options: IQueryOptions = {}): Promise<IFilterResult<T>> {
    const meta = await this.collectionMeta.get();
    const dateColumns:any = [];
    // @ts-ignore
    if(meta.columns && meta.columns.length > 0){
      console.log('meta columns')
      // @ts-ignore
      for(const col of meta.columns){
        console.log(col, ['date', 'datetime'].indexOf(col.type));
        if(['date', 'datetime'].indexOf(col.type) > -1){
          console.log('setting date');
          dateColumns.push(col.title);
        }
      }

    }
    const filterResult:any = {

    };
    let data = await this.persistenceAdapter.getData();
    console.log(data[1]);
    if(Object.keys(query).length > 0){
      console.log({query});
      data = data.filter(sift(query));
    }
    filterResult['totalCount'] = data.length;
    if(options.sort){
      data = sort(data).by(options.sort)
    }
    if(options.offset){
      data = data.slice(options.offset, data.length);
    }
    if(options.limit){
      data = data.slice(0, options.limit);
    }
    filterResult['count'] = data.length;

    filterResult['rows'] = data.map((row:any) => {
      for(const dateColumn of dateColumns){
        row[dateColumn] = new Date(row[dateColumn]);
      }

      return row;
    });
    return  filterResult;
  }


}