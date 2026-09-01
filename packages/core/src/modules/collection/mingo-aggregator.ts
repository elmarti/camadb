import { Aggregator } from 'mingo';
import 'mingo/init/system';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';
import { AggregationPipeline, Document } from '../../interfaces/document-types';

export class MingoAggregator<TDocument extends object = Document> implements IAggregator<TDocument>{
  constructor(private persistenceAdapter: IPersistenceAdapter){
  }
  async aggregate<TResult extends object = TDocument>(pipeline: AggregationPipeline<TDocument>): Promise<TResult[]> {
    const data = await this.persistenceAdapter.getData();
    const agg = new Aggregator(pipeline as any);
    return agg.run(data) as TResult[];
  }

}
