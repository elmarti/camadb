import { promises as nodeFs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { FlattedSerializer } from '../../serialization/flatted-serializer';
import { ILogger } from '../../../interfaces/logger.interface';
import { Fs } from '../fs/fs';
import {
  CURRENT_STORAGE_VERSION,
  LEGACY_STORAGE_MESSAGE,
  LegacyStorageError,
  createStorageEnvelope,
  detectStorage,
  readStoragePayload,
} from '../storage-version';

const logger: ILogger = {
  log: jest.fn(),
  startTimer: jest.fn(() => 'timer'),
  endTimer: jest.fn(),
};

const fixtureRoot = path.join(__dirname, 'fixtures', '2.0.0');

describe('storage version detection', () => {
  it('detects published 2.x adapter values without changing them', async () => {
    const localStorageFixture = await nodeFs.readFile(path.join(fixtureRoot, 'localstorage.json'), 'utf8');
    const indexedDbFixture = await nodeFs.readFile(path.join(fixtureRoot, 'indexeddb.json'), 'utf8');
    const localValue = JSON.parse(localStorageFixture);
    const indexedDbValue = JSON.parse(indexedDbFixture).value;

    expect(detectStorage(localValue)).toEqual({ kind: 'legacy', version: 2 });
    expect(detectStorage(indexedDbValue)).toEqual({ kind: 'legacy', version: 2 });
    expect(JSON.stringify(localValue)).toBe(localStorageFixture.trim());
    expect(JSON.stringify(indexedDbValue)).toBe(JSON.stringify(JSON.parse(indexedDbFixture).value));
  });

  it('refuses the published filesystem fixture without rewriting it', async () => {
    const fixturePath = path.join(fixtureRoot, 'fs', 'people', 'data');
    const original = await nodeFs.readFile(fixturePath);
    const directory = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-legacy-'));
    const dataPath = path.join(directory, 'people', 'data');
    await nodeFs.mkdir(path.dirname(dataPath), { recursive: true });
    await nodeFs.writeFile(dataPath, original);

    const fs = new Fs(new FlattedSerializer(logger), logger);
    await expect(fs.readData(dataPath)).rejects.toThrow(LEGACY_STORAGE_MESSAGE);
    await expect(nodeFs.readFile(dataPath)).resolves.toEqual(original);

    await nodeFs.rm(directory, { recursive: true, force: true });
  });

  it('creates a recognizable v3 envelope for new storage', () => {
    const envelope = createStorageEnvelope([{ _id: 'new' }]);
    expect(envelope).toEqual({
      camaDB: { format: 'collection', version: CURRENT_STORAGE_VERSION },
      data: [{ _id: 'new' }],
    });
    expect(detectStorage(envelope)).toEqual({ kind: 'current', version: CURRENT_STORAGE_VERSION });
  });

  it('refuses published browser fixtures without changing them', async () => {
    const localStorageFixture = await nodeFs.readFile(path.join(fixtureRoot, 'localstorage.json'), 'utf8');
    const indexedDbFixture = await nodeFs.readFile(path.join(fixtureRoot, 'indexeddb.json'), 'utf8');
    const legacy = [{ _id: 'legacy-1', name: 'Ada' }];
    const before = JSON.stringify(legacy);

    expect(() => readStoragePayload(legacy)).toThrow(LEGACY_STORAGE_MESSAGE);
    const error = captureError(() => readStoragePayload(legacy));
    expect(error).toBeInstanceOf(LegacyStorageError);
    expect(error).toMatchObject({ code: 'CAMADB_LEGACY_STORAGE' });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(localStorageFixture).toBe(await nodeFs.readFile(path.join(fixtureRoot, 'localstorage.json'), 'utf8'));
    expect(indexedDbFixture).toBe(await nodeFs.readFile(path.join(fixtureRoot, 'indexeddb.json'), 'utf8'));
  });

  it('rejects unknown envelopes instead of guessing or mutating them', () => {
    const future = { camaDB: { format: 'collection', version: 99 }, data: [] };
    expect(detectStorage(future)).toEqual({ kind: 'unsupported', version: 99 });
    expect(() => readStoragePayload(future as never)).toThrow('Unsupported CamaDB storage version 99');
    expect(future.camaDB.version).toBe(99);
  });
});

const captureError = (operation: () => unknown): unknown => {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return undefined;
};
