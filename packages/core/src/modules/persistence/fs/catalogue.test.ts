import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Cama, PersistenceAdapterEnum } from '../../../..';
describe('public filesystem catalogue', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cama-catalogue-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  test('missing database and collection checks never create files', async () => {
    const location = path.join(root, 'missing');
    const db = new Cama({ path: location, persistenceAdapter: PersistenceAdapterEnum.FS });
    expect(await db.listCollections()).toEqual({ collections: [] });
    expect(await db.collectionExists('absent')).toBe(false);
    expect(await db.describeCollection('absent')).toBeUndefined();
    expect(await fs.readdir(root)).toEqual([]);
  });
  test('discovers declared types and indexes with stable bounded pagination and no mutation', async () => {
    const db = new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS });
    for (const name of ['zeta', 'alpha', 'middle']) {
      const c = await db.initCollection(name, {
        columns: [{ title: 'createdAt', type: 'date' }],
        indexes: ['createdAt'],
      });
      await c.insertOne({ _id: 'one', createdAt: new Date('2026-01-01') });
    }
    const before = await fs.readFile(path.join(root, 'alpha', 'meta.json'), 'utf8');
    const first = await db.listCollections({ limit: 2 });
    expect(first.collections.map((c) => c.name)).toEqual(['alpha', 'middle']);
    expect(first.nextCursor).toBe('middle');
    expect((await db.listCollections({ after: first.nextCursor, limit: 2 })).collections.map((c) => c.name)).toEqual([
      'zeta',
    ]);
    expect(await db.describeCollection('alpha')).toEqual({
      name: 'alpha',
      columns: [{ title: 'createdAt', type: 'date' }],
      indexes: ['createdAt'],
    });
    expect(await db.collectionExists('alpha')).toBe(true);
    expect(await fs.readFile(path.join(root, 'alpha', 'meta.json'), 'utf8')).toBe(before);
    await expect(db.listCollections({ limit: 101 })).rejects.toThrow('page size');
    await expect(db.describeCollection('../escape')).rejects.toThrow('name');
  });
  test('rejects malformed, oversized and symlink metadata without initializing it', async () => {
    const db = new Cama({ path: root, persistenceAdapter: PersistenceAdapterEnum.FS });
    await fs.mkdir(path.join(root, 'bad'));
    const file = path.join(root, 'bad', 'meta.json');
    await fs.writeFile(file, '{}');
    await expect(db.collectionExists('bad')).rejects.toThrow('metadata');
    await fs.writeFile(file, ' '.repeat(262145));
    await expect(db.describeCollection('bad')).rejects.toThrow('256 KiB');
    await fs.rm(file);
    await fs.symlink(path.join(root, 'outside'), file);
    await expect(db.describeCollection('bad')).rejects.toThrow();
  });
});
