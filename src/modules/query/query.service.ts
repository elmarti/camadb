import { IQueryService } from '../../interfaces/query-service.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import sift from "sift";

@injectable()
export class QueryService<T> implements IQueryService<T>{
  constructor(@inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter) {
  }
  async filter(query: any = {}): Promise<T> {
    const data = await this.persistenceAdapter.getData();

    if(Object.keys(query).length > 0){
      console.log({query});
      return data.filter(sift(query));
    }
    return data;
  }


}