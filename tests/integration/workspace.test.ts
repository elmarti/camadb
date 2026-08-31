import { Cama as CoreCama, PersistenceAdapterEnum } from '@camadb/core';
import { createRows } from '@camadb/test-utils';
import { Cama as CompatibilityCama } from 'camadb';

describe('workspace package integration', () => {
  it('preserves the camadb entry point and operates through public APIs', async () => {
    expect(CompatibilityCama).toBe(CoreCama);

    const database = new CoreCama({ persistenceAdapter: PersistenceAdapterEnum.InMemory });
    const collection = await database.initCollection('integration', { columns: [], indexes: [] });
    await collection.insertMany(createRows(3));

    const result = await collection.findMany({});
    expect(result.rows).toHaveLength(3);
  });
});
