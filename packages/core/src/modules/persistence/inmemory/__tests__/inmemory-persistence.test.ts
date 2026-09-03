import InmemoryPersistence from '../inmemory-persistence';
import { IPersistenceAdapter } from '../../../../interfaces/persistence-adapter.interface';

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

  it('should destroy the cache and prevent further operations', async () => {
    await adapter.destroy();
    await expect(adapter.getData()).rejects.toThrow('Collection has been destroyed');
    await expect(adapter.update([])).rejects.toThrow('Collection has been destroyed');
  });

  it('gets zero, one, missing, and multiple records by id', async () => {
    const rows = [
      { _id: 'first', name: 'John' },
      { _id: 'second', name: 'Jane' },
    ];
    await adapter.insert(rows);

    await expect(adapter.getRecords?.([])).resolves.toEqual(new Map());
    await expect(adapter.getRecords?.(['first'])).resolves.toEqual(new Map([['first', rows[0]]]));
    await expect(adapter.getRecords?.(['missing'])).resolves.toEqual(new Map());
    await expect(adapter.getRecords?.(['second', 'first'])).resolves.toEqual(
      new Map([
        ['first', rows[0]],
        ['second', rows[1]],
      ]),
    );
  });

  it('rejects record lookup after destruction', async () => {
    await adapter.destroy();
    await expect(adapter.getRecords?.(['record'])).rejects.toThrow('Collection has been destroyed');
  });
});
