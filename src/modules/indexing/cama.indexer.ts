import { injectable } from 'inversify';
import { IIndexer } from '../../interfaces/indexer.interface';


@injectable()
export class CamaIndexer implements IIndexer {

  async index(rows: Array<any>): Promise<Array<any>> {
    return rows;
  }
  async addMetaData(dataset: Array<any>, rows: Array<any>): Promise<Array<any>> {
    const lastValue = dataset[dataset.length -1];
    let startIndex = lastValue?.$$camaMeta.camaIndex || 0;
    console.log('indexing')
    console.time('indexing');
    for(const row of rows){
      row['$$camaMeta'] = {
        camaIndex: startIndex
      };
      startIndex++;
    }
    console.time('indexing');
    return rows;
  }
  async search(query: any): Promise<Array<any>> {
    return [];
  }
}