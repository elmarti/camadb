import { createMockContainer } from '../../../mocks/createMockContainer';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../types';
import { MingoAggregator } from '../mingo-aggregator';
import { IAggregator } from '../../../interfaces/aggregator.interface';


let container:any = null;

beforeEach(() =>  {
  container = createMockContainer('test-collection', {
    persistenceAdapter: PersistenceAdapterEnum.InMemory
  }, {
    columns:[],
    indexes:[]
  })
  container.rebind(TYPES.Aggregator)
    .to(MingoAggregator);
})

it('loads the data from the persistence adapter', async () => {
  const mingoAggregator = container.get(TYPES.Aggregator);
  const persistenceAdapter = container.get(TYPES.PersistenceAdapter);
  const spy = jest.spyOn(persistenceAdapter, 'getData');
  await mingoAggregator.aggregate([]);
  expect(spy).toHaveBeenCalled();
});

//This **could** go on forever... I'll add more when I'm bored
//That said, do we **need** to test a third party library?

it('performs aggregations', async () => {
  const mingoAggregator:IAggregator = container.get(TYPES.Aggregator);
  const query = [{
    $match :{
      color: {
        $in: ["blue", "green", "cyan"]
      }
    }
  }];
  const result = await mingoAggregator.aggregate(query)
  expect(result).toEqual( [
      { color: 'green', value: '#0f0' },
      { color: 'blue', value: '#00f' },
      { color: 'cyan', value: '#0ff' }
    ]
  );

})