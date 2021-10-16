import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../types';
import { Collection } from '../index';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../../interfaces/query-service.interface';

let collection = new Collection('test-collection', {
  columns:[],
  indexes:[]
}, {
  persistenceAdapter: PersistenceAdapterEnum.InMemory,
  test: true
});

it('should call the persistence adapter with the appropriate rows on insert', async () => {
  const rows =[{
    field:"field 1"
  },{
    field:"field 2"
  },{
    field:"field 3"
  }];
  const persistenceAdapter = collection.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
  const spy = jest.spyOn(persistenceAdapter, 'insert');
  await collection.insertMany(rows);
  expect(spy).toHaveBeenCalledWith(rows);
});

it('should call the persistence adapter with the appropriate row on insert', async () => {
  const row ={
    field:"field 1"
  };
  const persistenceAdapter = collection.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
  const spy = jest.spyOn(persistenceAdapter, 'insert');
  await collection.insertOne(row);
  expect(spy).toHaveBeenCalledWith([row]);
});

it('should correctly invoke the query service', async () => {

  const queryService = collection.container.get<IQueryService<any>>(TYPES.QueryService);
  const spy = jest.spyOn(queryService, 'filter');
  await collection.findMany({
    field: "field 1"
  });

})