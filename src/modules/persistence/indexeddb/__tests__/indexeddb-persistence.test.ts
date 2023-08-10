import { ICamaConfig } from "../../../../interfaces/cama-config.interface";
import { ICollectionConfig } from "../../../../interfaces/collection-config.interface";
import { ILogger } from "../../../../interfaces/logger.interface";
import { PersistenceAdapterEnum } from "../../../../interfaces/perisistence-adapter.enum";
import IndexedDbPersistence from "../indexeddb-persistence";

describe("IndexedDbPersistence", () => {
  const mockConfig: ICamaConfig = { path: "test-path", persistenceAdapter: PersistenceAdapterEnum.InMemory };
  const mockLogger: ILogger = { log: jest.fn(), startTimer: jest.fn(), endTimer: jest.fn() };
  const mockCollectionName = "test-collection";

  let indexedDbPersistence: IndexedDbPersistence;

  const mockCollectionConfig: ICollectionConfig = {
    indexes: [
      { name: 'index1', column: 'column1', unique: false },
      { name: 'index2', column: 'column2', unique: true },
    ],
    columns: []
  };
  
  beforeEach(() => {
    indexedDbPersistence = new IndexedDbPersistence(mockConfig, mockLogger, mockCollectionName, mockCollectionConfig);
  });


  describe("indexes", () => {
    it("should create indexes in the object store", async () => {
      await indexedDbPersistence.update([]); // Ensure the database is initialized
  
      //@ts-ignore
      const tx = indexedDbPersistence.db.transaction(mockCollectionName, 'readonly');
      const store = tx.objectStore(mockCollectionName);
  
      const indexNames = Array.from(store.indexNames);
  
      expect(indexNames.length).toBe(mockCollectionConfig.indexes.length);
  
      for (const indexConfig of mockCollectionConfig.indexes) {
        expect(indexNames).toContain(indexConfig.name);
        const index = store.index(indexConfig.name);
        expect(index.unique).toBe(indexConfig.unique);
      }
    });
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
