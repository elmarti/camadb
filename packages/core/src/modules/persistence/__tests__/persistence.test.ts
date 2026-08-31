import { selectPersistenceAdapterClass } from "../";
import { PersistenceAdapterEnum } from "../../../interfaces/perisistence-adapter.enum";
import  FSAdapter  from "../fs";
import  IndexedDBAdapter  from "../indexeddb";
import  LocalStorageAdapter  from "../localstorage";
import  InmemoryPersistence  from "../inmemory";

describe("selectPersistenceAdapterClass", () => {
  it("should return the FSAdapter class when 'fs' is passed in", () => {
    expect(selectPersistenceAdapterClass(PersistenceAdapterEnum.FS)).toBe(
      FSAdapter
    );
  });

  it("should return the IndexedDBAdapter class when 'indexeddb' is passed in", () => {
    expect(
      selectPersistenceAdapterClass(PersistenceAdapterEnum.IndexedDb)
    ).toBe(IndexedDBAdapter);
  });

  it("should return the LocalStorageAdapter class when 'localstorage' is passed in", () => {
    expect(
      selectPersistenceAdapterClass(PersistenceAdapterEnum.LocalStorage)
    ).toBe(LocalStorageAdapter);
  });

  it("should return the InmemoryPersistence class when 'inmemory' is passed in", () => {
    expect(
      selectPersistenceAdapterClass(PersistenceAdapterEnum.InMemory)
    ).toBe(InmemoryPersistence);
  });

  it("should throw an error if an invalid adapter is passed in", () => {
    expect(() => selectPersistenceAdapterClass("invalid-adapter" as any)).toThrow(
      Error
    );
  });
});
