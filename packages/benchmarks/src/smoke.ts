import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { createRows } from '@camadb/test-utils';

export const runSmokeBenchmark = async (rowCount = 1_000): Promise<number> => {
  const database = new Cama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
  const collection = await database.initCollection('benchmark', { columns: [], indexes: [] });
  const started = Date.now();
  await collection.insertMany(createRows(rowCount));
  await collection.findMany({});
  return Date.now() - started;
};
