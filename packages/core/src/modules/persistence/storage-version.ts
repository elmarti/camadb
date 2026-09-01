export const CURRENT_STORAGE_VERSION = 3 as const;
export const LEGACY_STORAGE_VERSION = 2 as const;

export interface StorageEnvelope<T> {
  readonly camaDB: {
    readonly format: 'collection';
    readonly version: typeof CURRENT_STORAGE_VERSION;
    readonly migratedFrom?: typeof LEGACY_STORAGE_VERSION;
  };
  readonly data: T;
}

export type StorageDetection =
  | { readonly kind: 'empty' }
  | { readonly kind: 'legacy'; readonly version: typeof LEGACY_STORAGE_VERSION }
  | { readonly kind: 'current'; readonly version: typeof CURRENT_STORAGE_VERSION }
  | { readonly kind: 'unsupported'; readonly version?: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStorageEnvelope = <T>(value: unknown): value is StorageEnvelope<T> => {
  if (!isRecord(value) || !isRecord(value.camaDB)) return false;
  return value.camaDB.format === 'collection' && value.camaDB.version === CURRENT_STORAGE_VERSION && 'data' in value;
};

/** Inspect persisted content without changing it or writing it back. */
export const detectStorage = (value: unknown): StorageDetection => {
  if (value === undefined || value === null) return { kind: 'empty' };
  if (isStorageEnvelope(value)) return { kind: 'current', version: CURRENT_STORAGE_VERSION };

  if (isRecord(value) && isRecord(value.camaDB) && value.camaDB.format === 'collection') {
    const version = typeof value.camaDB.version === 'number' ? value.camaDB.version : undefined;
    return { kind: 'unsupported', version };
  }

  // Every published 2.x adapter persisted the collection payload itself.
  return Array.isArray(value)
    ? { kind: 'legacy', version: LEGACY_STORAGE_VERSION }
    : { kind: 'unsupported' };
};

export const createStorageEnvelope = <T>(data: T, migratedFrom?: typeof LEGACY_STORAGE_VERSION): StorageEnvelope<T> => ({
  camaDB: {
    format: 'collection',
    version: CURRENT_STORAGE_VERSION,
    ...(migratedFrom === undefined ? {} : { migratedFrom }),
  },
  data,
});

/**
 * Produce migrated content for the caller to persist explicitly.
 * Re-running this function with its result is safe and returns the same envelope.
 */
export const migrateLegacyStorage = <T>(value: T[] | StorageEnvelope<T[]>): StorageEnvelope<T[]> => {
  const detection = detectStorage(value);
  if (detection.kind === 'current') return value as StorageEnvelope<T[]>;
  if (detection.kind === 'legacy') return createStorageEnvelope(value as T[], LEGACY_STORAGE_VERSION);
  throw new Error('Cannot migrate empty or unsupported CamaDB storage');
};

/** Export the 2.x-compatible collection payload without altering the source. */
export const exportLegacyStorage = <T>(value: T[] | StorageEnvelope<T[]>): T[] => {
  const detection = detectStorage(value);
  if (detection.kind === 'legacy') return value as T[];
  if (detection.kind === 'current') return (value as StorageEnvelope<T[]>).data;
  throw new Error('Cannot export empty or unsupported CamaDB storage');
};

export const readStoragePayload = <T>(value: T[] | StorageEnvelope<T[]> | undefined): T[] => {
  if (value === undefined) return [];
  const detection = detectStorage(value);
  if (detection.kind === 'legacy') return value as T[];
  if (detection.kind === 'current') return (value as StorageEnvelope<T[]>).data;
  const version = detection.kind === 'unsupported' ? detection.version : undefined;
  throw new Error(`Unsupported CamaDB storage version${version === undefined ? '' : ` ${version}`}`);
};
