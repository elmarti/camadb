import { CollectionDescriptor, CollectionListOptions } from '../../interfaces/collection-catalogue.interface';
export function catalogueName(name: string): void {
  if (typeof name !== 'string' || !name || name.length > 255 || /[\0/\\]/.test(name) || name === '.' || name === '..')
    throw new Error('Invalid collection name.');
}
export function catalogueLimit(options: CollectionListOptions): number {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Catalogue page size must be between 1 and 100.');
  if (options.after !== undefined) catalogueName(options.after);
  return limit;
}
export function collectionDescriptor(name: string, value: unknown): CollectionDescriptor {
  if (!value || typeof value !== 'object') throw new Error('Invalid collection metadata.');
  const meta = value as Record<string, unknown>;
  if (
    meta.collectionName !== name ||
    !Array.isArray(meta.columns) ||
    meta.columns.length > 1000 ||
    meta.columns.some(
      (c) =>
        !c || typeof c.title !== 'string' || typeof c.type !== 'string' || c.title.length > 255 || c.type.length > 100,
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
}
