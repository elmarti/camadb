import { IQueryService } from '../interfaces/query-service.interface';
import { IQueryOptions } from '../interfaces/query-options.interface';
import { IFilterResult } from '../interfaces/filter-result.interface';
import { injectable } from 'inversify';

@injectable()
export class QueryServiceMock implements IQueryService<any>{
  filter(query: any, options: IQueryOptions): Promise<IFilterResult<any>> {
    return Promise.resolve({  } as any);
  }

  update(query: any, delta: any): Promise<void> {
    return Promise.resolve(undefined);
  }

}