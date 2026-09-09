import { promises as fs, constants } from 'fs';
import * as path from 'path';
import { ICamaConfig } from '../../../interfaces/cama-config.interface';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import {
  CollectionDescriptor,
  CollectionListOptions,
  CollectionListPage,
} from '../../../interfaces/collection-catalogue.interface';
function nameCheck(name: string): void {
  if (!name || name.length > 255 || /[\0/\\]/.test(name) || name === '.' || name === '..')
    throw new Error('Invalid collection name.');
}
function root(config: ICamaConfig): string {
  if (config.persistenceAdapter !== PersistenceAdapterEnum.FS)
    throw new Error('Collection catalogue currently requires filesystem persistence.');
  return path.resolve(config.path ?? './.cama');
}
async function directory(directoryPath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(directoryPath);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Catalogue directories must be ordinary directories.');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export async function describeCollection(config: ICamaConfig, name: string): Promise<CollectionDescriptor | undefined> {
  nameCheck(name);
  const base = root(config);
  if (!(await directory(base)) || !(await directory(path.join(base, name)))) return undefined;
  let handle;
  try {
    handle = await fs.open(path.join(base, name, 'meta.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 262144)
      throw new Error('Collection metadata must be a regular file of at most 256 KiB.');
    const buffer = Buffer.alloc(262145);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (
      bytesRead > 262144 ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytesRead !== before.size
    )
      throw new Error('Collection metadata changed while reading; retry with a closed database.');
    const value: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    if (!value || typeof value !== 'object') throw new Error('Invalid collection metadata.');
    const meta = value as Record<string, unknown>;
    if (
      meta.collectionName !== name ||
      !Array.isArray(meta.columns) ||
      meta.columns.length > 1000 ||
      meta.columns.some(
        (c) =>
          !c ||
          typeof c.title !== 'string' ||
          typeof c.type !== 'string' ||
          c.title.length > 255 ||
          c.type.length > 100,
      ) ||
      !Array.isArray(meta.indexes) ||
      meta.indexes.length > 1000 ||
      meta.indexes.some((i) => typeof i !== 'string' || i.length > 255)
    )
      throw new Error('Invalid collection metadata.');
    return {
      name,
      columns: meta.columns.map((c) => ({ title: c.title, type: c.type })),
      indexes: [...meta.indexes] as string[],
    };
  } finally {
    await handle.close();
  }
}
export async function listCollections(
  config: ICamaConfig,
  options: CollectionListOptions = {},
): Promise<CollectionListPage> {
  const base = root(config),
    limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Catalogue page size must be between 1 and 100.');
  if (options.after !== undefined) nameCheck(options.after);
  if (!(await directory(base))) return { collections: [] };
  const names: string[] = [];
  const handle = await fs.opendir(base);
  let entries = 0;
  for await (const entry of handle) {
    if (++entries > 10000) throw new Error('Catalogue discovery is limited to 10,000 directory entries.');
    if (entry.isSymbolicLink()) throw new Error('Catalogue does not follow symbolic links.');
    if (entry.isDirectory() && (!options.after || entry.name > options.after)) names.push(entry.name);
  }
  names.sort();
  const collections: CollectionDescriptor[] = [];
  for (const name of names) {
    const descriptor = await describeCollection(config, name);
    if (!descriptor) continue;
    if (collections.length === limit) return { collections, nextCursor: collections[collections.length - 1].name };
    collections.push(descriptor);
  }
  return { collections };
}
