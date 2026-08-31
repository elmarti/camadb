import { Aggregator } from 'mingo';
import 'mingo/init/system';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';

export class MingoAggregator implements IAggregator{
  constructor(private persistenceAdapter: IPersistenceAdapter){
  }
  async aggregate(pipeline: Array<any>): Promise<any> {
    const data = await this.persistenceAdapter.getData();
    const agg = new Aggregator(pipeline);
    return agg.run(data);
  }

}
