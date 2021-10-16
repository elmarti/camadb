import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../types';
import { Collection } from '../index';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { IQueryService } from '../../../interfaces/query-service.interface';

//Not sure how to type this effectively
let collection = new Collection('test-collection', {
  columns:[],
  indexes:[]
}, {
  persistenceAdapter: PersistenceAdapterEnum.InMemory,
  test: true
});
beforeEach(() => {
  collection = new Collection('test-collection', {
    columns:[],
    indexes:[]
  }, {
    persistenceAdapter: PersistenceAdapterEnum.InMemory,
    test: true
  });
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

it('should correctly invoke the query service without options', async () => {

  const queryService = collection.container.get<IQueryService<any>>(TYPES.QueryService);
  const spy = jest.spyOn(queryService, 'filter');
  const  query = {
    field: "field 1"
  };
  await collection.findMany(query);
  expect(spy).toHaveBeenCalledWith(query, undefined);
})
it('should correctly invoke the query service with options', async () => {

  const queryService = collection.container.get<IQueryService<any>>(TYPES.QueryService);
  const spy = jest.spyOn(queryService, 'filter');
  const  query = {
    field: "field 1"
  };
  const options = {
    limit:100
  }
  await collection.findMany(query, options);
  expect(spy).toHaveBeenCalledWith(query, options);
})

it('should correctly invoke the query service for update', async () => {

  const queryService = collection.container.get<IQueryService<any>>(TYPES.QueryService);
  const spy = jest.spyOn(queryService, 'update');
  const  query = {
    field: "field 1"
  };
  const delta = {
    field: "field 2"
  }
  await collection.updateMany(query, delta);
  expect(spy).toHaveBeenCalledWith(query, delta);
})

it('should call the destroy function on the persistence adapter', async () => {

  const persistenceAdapter = collection.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
  const spy = jest.spyOn(persistenceAdapter, 'destroy');
  await collection.destroy();
  expect(spy).toHaveBeenCalled();
});

it('destroyed collections should throw an error on usage', async () => {

  const persistenceAdapter = collection.container.get<IPersistenceAdapter>(TYPES.PersistenceAdapter);
  await collection.destroy();
  const errorMessage = 'Collection has been destroyed. Call Cama.initCollection to recreate';
  expect(collection.insertMany([{}])).rejects.toThrow(errorMessage);
  expect(collection.insertOne({})).rejects.toThrow(errorMessage);
  expect(collection.findMany({})).rejects.toThrow(errorMessage);
  expect(collection.updateMany({}, {})).rejects.toThrow(errorMessage);
});