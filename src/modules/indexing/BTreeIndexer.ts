import { injectable } from 'inversify';
import { IIndexer } from '../../interfaces/indexer.interface';


@injectable()
export class BTreeIndexer implements IIndexer{
  async index(index:rows: Array<any>): Promise<any> {
    return
  }
  async addMetaData(dataset: Array<any>, rows: Array<any>): Promise<Array<any>> {
    return rows;
  }

}