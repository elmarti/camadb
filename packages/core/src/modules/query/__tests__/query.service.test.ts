import { QueryService } from '../query.service';
import { IPersistenceAdapter } from '../../../interfaces/persistence-adapter.interface';
import { ILogger } from '../../../interfaces/logger.interface';
import { ICollectionMeta } from '../../../interfaces/collection-meta.interface';

describe('QueryService', () => {
  let queryService: QueryService<any>;
  let persistenceAdapter: IPersistenceAdapter;
  let logger: ILogger;
  let collectionMeta: ICollectionMeta;

  beforeEach(() => {
    persistenceAdapter = {
      getData: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
      destroy: jest.fn()
    };
    logger = {
      log: jest.fn(),
      startTimer: jest.fn(),
      endTimer: jest.fn(),
    };
    collectionMeta = {
      update: jest.fn(),
      get: jest.fn()
    };

    queryService = new QueryService<any>(collectionMeta, persistenceAdapter, logger);
  });

  it('should create an instance of QueryService', () => {
    expect(queryService).toBeInstanceOf(QueryService);
  });

  it('should filter data based on query and options', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'A' },
    ];

    (persistenceAdapter.getData as jest.Mock).mockResolvedValue(sampleData);
    const query = { value: 'A' };
    const options = { limit: 1, offset: 1, sort: [{ asc: 'id' }] };

    const result = await queryService.filter(query, options);

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 2,
      count: 1,
      rows: [{ id: 3, value: 'A' }],
    });
  });

  it('should update data based on query and delta', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'A' },
    ];

    (persistenceAdapter.getData as jest.Mock).mockResolvedValue(sampleData);
    (persistenceAdapter.update as jest.Mock).mockResolvedValue(undefined);
    const query = { value: 'A' };
    const delta = { $set:{value: 'Updated' }};

    const result = await queryService.update(query, delta);

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(persistenceAdapter.update).toHaveBeenCalledWith([
      { id: 1, value: 'Updated' },
      { id: 2, value: 'B' },
      { id: 3, value: 'Updated' },
    ]);
    expect(result).toEqual({
      acknowledged: true,
      matchedCount: 2,
      modifiedCount: 2,
      upsertedCount: 0,
    });
  });
  it('should sort data based on options.sort', async () => {
    const sampleData = [
      { id: 3, value: 'C' },
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
    ];

    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);
    const options = { sort: [{ asc: 'value' }] };

    const result = await queryService.filter({}, options);

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 3,
      count: 3,
      rows: [
        { id: 1, value: 'A' },
        { id: 2, value: 'B' },
        { id: 3, value: 'C' },
      ],
    });
  });

  it('should apply options.offset', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];

    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);
    const options = { offset: 1 };

    const result = await queryService.filter({}, options);

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 3,
      count: 2,
      rows: [
        { id: 2, value: 'B' },
        { id: 3, value: 'C' },
      ],
    });
  });

  it('should apply options.limit', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];

    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);
    const options = { limit: 2 };

    const result = await queryService.filter({}, options);

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 3,
      count: 2,
      rows: [
        { id: 1, value: 'A' },
        { id: 2, value: 'B' },
      ],
    });
  });

  it('should return empty rows if data is empty', async () => {
    const sampleData: Array<any> = [];

    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);

    const result = await queryService.filter();

    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 0,
      count: 0,
      rows: [],
    });
  });
  it('should apply limit if offset is not provided and limit is greater than data length', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'A' },
    ];
  
    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);
    const query = { value: 'A' };
    const options = { limit: 5, sort: [{ asc: 'id' }] };
  
    const result = await queryService.filter(query, options);
  
    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 2,
      count: 2,
      rows: [{ id: 1, value: 'A' }, { id: 3, value: 'A' }],
    });
  });
  it('should not apply limit if offset is not provided and limit is greater than data length', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'A' },
    ];
  
    persistenceAdapter.getData = jest.fn().mockResolvedValue(sampleData);
    const query = { value: 'A' };
    const options = { limit: 5, sort: [{ asc: 'id' }] };
  
    const result = await queryService.filter(query, options);
  
    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual({
      totalCount: 2,
      count: 2,
      rows: [{ id: 1, value: 'A' }, { id: 3, value: 'A' }],
    });
  });
  it('should update data using the persistence adapter', async () => {
    const sampleData = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];
    const updatedData = [
      { id: 1, value: 'R' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];
  
    (persistenceAdapter.getData as jest.Mock).mockResolvedValue(sampleData);
    (persistenceAdapter.update as jest.Mock).mockResolvedValue(undefined);
  
    const query = { id: 1 };
    const delta = { $set: { value: 'R' } };
  
    await queryService.update(query, delta);
  
    expect(persistenceAdapter.getData).toHaveBeenCalled();
    expect(persistenceAdapter.update).toHaveBeenCalledWith(updatedData);
  });

  it('counts matching rows', async () => {
    (persistenceAdapter.getData as jest.Mock).mockResolvedValue([
      { value: 'A' },
      { value: 'B' },
      { value: 'A' },
    ]);

    await expect(queryService.count({ value: 'A' })).resolves.toBe(2);
    await expect(queryService.count()).resolves.toBe(3);
  });

  it('deletes one or all matching rows and reports the count', async () => {
    const data = [{ id: 1, value: 'A' }, { id: 2, value: 'A' }, { id: 3, value: 'B' }];
    (persistenceAdapter.getData as jest.Mock).mockResolvedValue(data);

    await expect(queryService.delete({ value: 'A' }, 1)).resolves.toEqual({
      acknowledged: true,
      deletedCount: 1,
    });
    expect(persistenceAdapter.update).toHaveBeenLastCalledWith([data[1], data[2]]);

    await expect(queryService.delete({ value: 'A' })).resolves.toEqual({
      acknowledged: true,
      deletedCount: 2,
    });
    expect(persistenceAdapter.update).toHaveBeenLastCalledWith([data[2]]);
  });
  
});
