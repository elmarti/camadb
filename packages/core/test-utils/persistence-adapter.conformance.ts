/* eslint-disable jest/no-export -- this module exports a reusable adapter test contract */
import { IPersistenceAdapter } from '../src/interfaces/persistence-adapter.interface';

export interface PersistenceAdapterConformanceContext {
  createAdapter(collectionName?: string): Promise<IPersistenceAdapter>;
  cleanup(): Promise<void>;
}

export interface PersistenceAdapterConformanceOptions {
  createContext(): Promise<PersistenceAdapterConformanceContext>;
  persistsAcrossInstances?: boolean;
  persistenceFollowUp?: string;
}

const rows = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
];

/**
 * Runs the shared behavioral contract for a persistence adapter.
 *
 * Adapter-specific durability and failure-injection tests belong beside the
 * adapter implementation. This suite intentionally exercises only the public
 * IPersistenceAdapter contract so new adapters can reuse it without inheriting
 * implementation details from an existing backend.
 */
export const persistenceAdapterConformance = (
  adapterName: string,
  options: PersistenceAdapterConformanceOptions,
): void => {
  describe(`${adapterName} persistence adapter conformance`, () => {
    let context: PersistenceAdapterConformanceContext;
    let adapter: IPersistenceAdapter;

    beforeEach(async () => {
      context = await options.createContext();
      adapter = await context.createAdapter('primary');
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('starts with an empty collection', async () => {
      await expect(adapter.getData()).resolves.toEqual([]);
    });

    it('appends inserted rows in order', async () => {
      await adapter.insert(rows.slice(0, 1));
      await adapter.insert(rows.slice(1));

      await expect(adapter.getData()).resolves.toEqual(rows);
    });

    it('replaces the complete dataset on update', async () => {
      await adapter.insert(rows);
      const replacement = [{ id: 3, name: 'Katherine' }];

      await adapter.update(replacement);

      await expect(adapter.getData()).resolves.toEqual(replacement);
    });

    it('keeps collections isolated', async () => {
      const secondary = await context.createAdapter('secondary');

      await adapter.insert(rows);

      await expect(secondary.getData()).resolves.toEqual([]);
    });

    it('makes the destroyed adapter unusable', async () => {
      await adapter.insert(rows);
      await adapter.destroy();

      await expect(adapter.getData()).rejects.toThrow();
    });

    if (options.persistsAcrossInstances) {
      it('makes completed writes visible to a new adapter instance', async () => {
        await adapter.insert(rows);
        const reopened = await context.createAdapter('primary');

        await expect(reopened.getData()).resolves.toEqual(rows);
      });
    } else if (options.persistenceFollowUp) {
      it.todo(`makes completed writes visible to a new adapter instance (${options.persistenceFollowUp})`);
    }
  });
};
