import { ICamaConfig } from "../../../../interfaces/cama-config.interface";
import { ILogger } from "../../../../interfaces/logger.interface";
import { PersistenceAdapterEnum } from "../../../../interfaces/perisistence-adapter.enum";
import IndexedDbPersistence from "../indexeddb-persistence";

describe("IndexedDbPersistence", () => {
  let databaseNumber = 0;
  let mockConfig: ICamaConfig;
  const mockLogger: ILogger = { log: jest.fn(), startTimer: jest.fn(), endTimer: jest.fn() };
  const mockCollectionName = "test-collection";

  let indexedDbPersistence: IndexedDbPersistence;

  beforeEach(() => {
    mockConfig = { path: `test-path-${databaseNumber++}`, persistenceAdapter: PersistenceAdapterEnum.InMemory };
    indexedDbPersistence = new IndexedDbPersistence(mockConfig, mockLogger, mockCollectionName);
  });

  it("opens a new database without waiting on itself", async () => {
    await expect(indexedDbPersistence.getData()).resolves.toEqual([]);
  });

  it("opens an existing collection without upgrading", async () => {
    await indexedDbPersistence.update(["persisted"]);
    const second = new IndexedDbPersistence(mockConfig, mockLogger, mockCollectionName);
    await expect(second.getData()).resolves.toEqual(["persisted"]);
  });

  it("adds a second collection through a safe upgrade", async () => {
    await indexedDbPersistence.getData();
    const second = new IndexedDbPersistence(mockConfig, mockLogger, "second-collection");
    await expect(second.getData()).resolves.toEqual([]);
    await expect(indexedDbPersistence.getData()).resolves.toEqual([]);
  });

  it("serializes concurrent collection initialization", async () => {
    const first = new IndexedDbPersistence(mockConfig, mockLogger, "first-concurrent");
    const second = new IndexedDbPersistence(mockConfig, mockLogger, "second-concurrent");
    await expect(Promise.all([first.getData(), second.getData()])).resolves.toEqual([[], []]);
  });

  it("adds database and collection context to errors without including content", async () => {
    const secret = "stored-secret";
    const uncloneable = { secret, value: () => undefined };
    await expect(indexedDbPersistence.update(uncloneable)).rejects.toThrow(
      `database "${mockConfig.path}", collection "${mockCollectionName}"`
    );
    await expect(indexedDbPersistence.update(uncloneable)).rejects.not.toThrow(secret);
  });

  afterEach(async () => {
    await indexedDbPersistence.destroy();
  });

  describe("getData", () => {
    it("should get data from IndexedDB", async () => {
      const data = ["test-data-1", "test-data-2", "test-data-3"];

      await indexedDbPersistence.update(data);

      const result = await indexedDbPersistence.getData();

      expect(result).toEqual(data);
    });
  });

  describe("update", () => {
    it("should update data in IndexedDB", async () => {
      const data = ["test-data-1", "test-data-2", "test-data-3"];
      const updatedData = ["test-data-4", "test-data-5"];

      await indexedDbPersistence.update(data);
      await indexedDbPersistence.update(updatedData);

      const result = await indexedDbPersistence.getData();

      expect(result).toEqual(updatedData);
    });
  });

  describe("insert", () => {
    it("should insert data into IndexedDB", async () => {
      const data = ["test-data-1", "test-data-2", "test-data-3"];
      const newData = ["test-data-4", "test-data-5"];

      await indexedDbPersistence.update(data);
      await indexedDbPersistence.insert(newData);

      const result = await indexedDbPersistence.getData();

      expect(result).toEqual([...data, ...newData]);
    });
  });
});
