import { promises as nodeFs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { ILogger } from '../../../../interfaces/logger.interface';
import { ISerializer } from '../../../../interfaces/serializer.interface';
import { Fs } from '../fs';

const serializer: ISerializer = {
  serialize: (payload: unknown) => JSON.stringify(payload),
  deserialize: (payload: Buffer) => JSON.parse(payload.toString()),
};

const logger: ILogger = {
  log: jest.fn(),
  startTimer: jest.fn(() => 'timer'),
  endTimer: jest.fn(),
};

describe('filesystem writes', () => {
  let directory: string;
  let collectionDirectory: string;
  let fs: Fs;

  beforeEach(async () => {
    directory = await nodeFs.mkdtemp(path.join(tmpdir(), 'camadb-fs-'));
    collectionDirectory = path.join(directory, 'records');
    await nodeFs.mkdir(collectionDirectory);
    fs = new Fs(serializer, logger);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await nodeFs.rm(directory, { recursive: true, force: true });
  });

  it('atomically replaces collection data for every mutation', async () => {
    await fs.writeData(directory, 'records', [{ id: 1 }]);
    await fs.writeData(directory, 'records', [{ id: 1, updated: true }]);
    await fs.writeData(directory, 'records', []);

    await expect(fs.readData(path.join(collectionDirectory, 'data'))).resolves.toEqual([]);
    await expect(nodeFs.readdir(collectionDirectory)).resolves.toEqual(['data']);
  });

  it('keeps committed data and removes its temporary file when replacement fails', async () => {
    const dataPath = path.join(collectionDirectory, 'data');
    await fs.writeData(directory, 'records', [{ id: 'committed' }]);

    const rename = jest.spyOn(nodeFs, 'rename').mockRejectedValueOnce(new Error('interrupted'));

    await expect(fs.writeData(directory, 'records', [{ id: 'uncommitted' }])).rejects.toThrow('interrupted');
    rename.mockRestore();

    await expect(fs.readData(dataPath)).resolves.toEqual([{ id: 'committed' }]);
    await expect(nodeFs.readdir(collectionDirectory)).resolves.toEqual(['data']);
  });

  it('resolves only after the replacement has been committed', async () => {
    const dataPath = path.join(collectionDirectory, 'data');

    await fs.writeData(directory, 'records', [{ id: 'visible' }]);

    await expect(nodeFs.readFile(dataPath, 'utf8')).resolves.toBe(
      '{"camaDB":{"format":"collection","version":3},"data":[{"id":"visible"}]}',
    );
    await expect(nodeFs.readdir(collectionDirectory)).resolves.toEqual(['data']);
  });

  it('syncs containing-directory metadata after replacing the file', async () => {
    const dataPath = path.join(collectionDirectory, 'data');
    const open = jest.spyOn(nodeFs, 'open');
    const rename = jest.spyOn(nodeFs, 'rename');

    await fs.writeData(directory, 'records', [{ id: 'durable' }]);

    expect(open).toHaveBeenNthCalledWith(1, `${dataPath}.tmp`, 'w');
    expect(open).toHaveBeenNthCalledWith(2, collectionDirectory, 'r');
    expect(rename.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[1]);
  });

  it('recovers by replacing a temporary file left by an interrupted process', async () => {
    const dataPath = path.join(collectionDirectory, 'data');
    await nodeFs.writeFile(`${dataPath}.tmp`, 'partial serialization');

    await fs.writeData(directory, 'records', [{ id: 'recovered' }]);

    await expect(fs.readData(dataPath)).resolves.toEqual([{ id: 'recovered' }]);
    await expect(nodeFs.readdir(collectionDirectory)).resolves.toEqual(['data']);
  });

  it('recursively removes a collection directory', async () => {
    await nodeFs.mkdir(path.join(collectionDirectory, 'nested'));
    await nodeFs.writeFile(path.join(collectionDirectory, 'nested', 'data'), 'persisted');

    await fs.rmDir(directory, 'records');

    await expect(nodeFs.stat(collectionDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
