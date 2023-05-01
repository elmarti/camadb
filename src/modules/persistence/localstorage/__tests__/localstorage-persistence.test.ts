import { ICamaConfig } from "../../../../interfaces/cama-config.interface";
import { ILogger } from "../../../../interfaces/logger.interface";
import { PersistenceAdapterEnum } from "../../../../interfaces/perisistence-adapter.enum";
import { ICollectionConfig } from "../../../../interfaces/collection-config.interface";
import LocalstoragePersistence from "../localstorage-persistence";
//@ts-ignore
import * as jls from 'jest-localstorage-mock';
describe("LocalstoragePersistence", () => {
  const mockConfig: ICamaConfig = { path: "test-path", persistenceAdapter: PersistenceAdapterEnum.InMemory };
  const mockLogger: ILogger = { log: jest.fn(), startTimer: jest.fn(), endTimer: jest.fn() };
  const mockCollectionName = "test-collection";
  const mockCollectionConfig: ICollectionConfig = {
    indexes: [
      { name: 'index1', column: 'column1' },
      { name: 'index2', column: 'column2' }
    ],
    columns: []
  };

  let localstoragePersistence: LocalstoragePersistence;

  beforeEach(() => {

    localstoragePersistence = new LocalstoragePersistence(mockConfig, mockLogger, mockCollectionName, mockCollectionConfig);
  });

  afterEach(() => {
    localstoragePersistence.destroy();
  });

  describe("getData", () => {
    it("should get data from localStorage", async () => {
      const data = [{ column1: "a", column2: "b" }, { column1: "c", column2: "d" }, { column1: "e", column2: "f" }];

      await localstoragePersistence.update(data);

      const result = await localstoragePersistence.getData();

      expect(result).toEqual(data);
    });
  });

  describe("update", () => {
    it("should update data in localStorage", async () => {
      const data = [{ column1: "a", column2: "b" }, { column1: "c", column2: "d" }, { column1: "e", column2: "f" }];
      const updatedData = [{ column1: "g", column2: "h" }, { column1: "i", column2: "j" }];

      await localstoragePersistence.update(data);
      await localstoragePersistence.update(updatedData);

      const result = await localstoragePersistence.getData();

      expect(result).toEqual(updatedData);
    });
  });

  describe("insert", () => {
    it("should insert data into localStorage and update indexes", async () => {
      const data = [{ column1: "a", column2: "b" }, { column1: "c", column2: "d" }, { column1: "e", column2: "f" }];
      const newData = [{ column1: "g", column2: "h" }, { column1: "i", column2: "j" }];

      await localstoragePersistence.update(data);
      await localstoragePersistence.insert(newData);

      const result = await localstoragePersistence.getData();

      expect(result).toEqual([...data, ...newData]);

      // Check if indexes have been updated
      for (const indexConfig of mockCollectionConfig.indexes) {
        expect(jls.localStorage.setItem).toHaveBeenCalledWith(
          expect.stringContaining(`-index-${indexConfig.column}`),
          expect.any(String)
        );
      }
    });
  });
});
