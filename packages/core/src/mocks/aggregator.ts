import { IAggregator } from '../interfaces/aggregator.interface';

export class AggregatorMock implements IAggregator {
  aggregate(pipeline: Array<any>): Promise<any> {
    return Promise.resolve(undefined);
  }

}