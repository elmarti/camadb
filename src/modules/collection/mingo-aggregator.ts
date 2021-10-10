import { inject, injectable } from 'inversify';
import { Aggregator } from 'mingo/aggregator';
import { IAggregator } from '../../interfaces/aggregator.interface';
import { TYPES } from '../../types';
import { IPersistenceAdapter } from '../../interfaces/persistence-adapter.interface';

import { OperatorType, useOperators } from 'mingo/core';
import * as pipelineOperators from 'mingo/operators/pipeline';
import * as projectionOperators from 'mingo/operators/projection';
import * as queryOperators from 'mingo/operators/query';
import * as expressionOperators from 'mingo/operators/expression';
import * as accumulatorOperators from 'mingo/operators/accumulator';

//@ts-ignore
useOperators(OperatorType.PIPELINE, pipelineOperators);
//@ts-ignore
useOperators(OperatorType.PROJECTION, projectionOperators);
//@ts-ignore
useOperators(OperatorType.QUERY, queryOperators);
//@ts-ignore
useOperators(OperatorType.EXPRESSION, expressionOperators);
useOperators(OperatorType.ACCUMULATOR, accumulatorOperators);

@injectable()
export class MingoAggregator implements IAggregator{
  constructor(@inject(TYPES.PersistenceAdapter) private persistenceAdapter: IPersistenceAdapter){
  }
  async aggregate(pipeline: Array<any>): Promise<any> {
    const data = await this.persistenceAdapter.getData();
    const agg = new Aggregator(pipeline);
    return agg.run(data);
  }

}