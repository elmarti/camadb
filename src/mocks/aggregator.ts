import { IAggregator } from '../interfaces/aggregator.interface';
import { injectable } from 'inversify';

@injectable()
export class AggregatorMock implements IAggregator {
  aggregate(pipeline: Array<any>): Promise<any> {
    return Promise.resolve(undefined);
  }

}