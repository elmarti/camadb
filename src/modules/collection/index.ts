import { ICollection } from '../../interfaces/collection.interface';
import { ICollectionConfig } from '../../interfaces/collection-config.interface';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../interfaces/query-service.interface';

@injectable()
export class Collection  implements ICollection   {


  private config?: ICollectionConfig;
  private name?: string;
  constructor(
    @inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter,
    @inject(TYPES.QueryService) private queryService: IQueryService<any>) {
  }

  async init(name: string, config: ICollectionConfig): Promise<void> {
    this.name = name;
    this.config = config;
    await this.persistenceAdapter.initCollection(name, config);
  }

  async insertMany(rows:Array<any>):Promise<void> {
    return this.persistenceAdapter.insert(rows);
  }

  async insertOne(row: any):Promise<void> {
    return this.persistenceAdapter.insert([row]);
  }
  async findMany<T>(query: any): Promise<Array<T>> {
    return await this.queryService.filter(query);
  }

}