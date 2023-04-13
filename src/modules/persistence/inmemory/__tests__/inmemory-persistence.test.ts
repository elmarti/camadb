import InmemoryPersistence from '../inmemory-persistence';
import { IPersistenceAdapter } from '../../../../interfaces/persistence-adapter.interface';
import 'reflect-metadata';

describe('InmemoryPersistence', () => {
  let adapter: IPersistenceAdapter;

  beforeEach(() => {
    adapter = new InmemoryPersistence();
  });

  afterEach(() => {
    adapter.destroy();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should insert and get data', async () => {
    const data = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
    await adapter.insert(data);
    const result = await adapter.getData();
    expect(result).toEqual(data);
  });

  it('should update data', async () => {
    const data = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
    await adapter.insert(data);
    const updatedData = [{ id: 1, name: 'Johnny' }, { id: 2, name: 'Janie' }];
    await adapter.update(updatedData);
    const result = await adapter.getData();
    expect(result).toEqual(updatedData);
  });

  // it('should destroy the cache and prevent further operations', async () => {
  //   await adapter.destroy();
  //   expect(adapter.getData).toThrowError('Collection has been destroyed. Call Cama.initCollection to recreate');
  //   expect(adapter.update).toThrowError('Collection has been destroyed. Call Cama.initCollection to recreate');
  // });
});
