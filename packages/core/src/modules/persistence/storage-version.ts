export const CURRENT_STORAGE_VERSION = 3 as const;
export const LEGACY_STORAGE_VERSION = 2 as const;

export interface StorageEnvelope<T> {
  readonly camaDB: {
    readonly format: 'collection';
    readonly version: typeof CURRENT_STORAGE_VERSION;
  };
  readonly data: T;
}

export type StorageDetection =
  | { readonly kind: 'empty' }
  | { readonly kind: 'legacy'; readonly version: typeof LEGACY_STORAGE_VERSION }
  | { readonly kind: 'current'; readonly version: typeof CURRENT_STORAGE_VERSION }
  | { readonly kind: 'unsupported'; readonly version?: number };

export const LEGACY_STORAGE_MESSAGE =
  'CamaDB 2 storage is not supported by CamaDB 3. Continue using CamaDB 2 or create a new CamaDB 3 store.';

export class LegacyStorageError extends Error {
  readonly code = 'CAMADB_LEGACY_STORAGE';

  /**
   * Create the error used when v3 refuses incompatible v2 storage without rewriting it.
   */
  constructor() {
    super(LEGACY_STORAGE_MESSAGE);
    this.name = 'LegacyStorageError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Test whether a value has the current collection envelope marker. This checks the envelope, not the shape of its generic payload.
 */
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

/**
 * Wrap a payload with the current collection format marker without persisting or cloning it.
 */
export const createStorageEnvelope = <T>(data: T): StorageEnvelope<T> => ({
  camaDB: {
    format: 'collection',
    version: CURRENT_STORAGE_VERSION,
  },
  data,
});

export const readStoragePayload = <T>(value: T[] | StorageEnvelope<T[]> | undefined): T[] => {
  if (value === undefined) return [];
  const detection = detectStorage(value);
  if (detection.kind === 'legacy') throw new LegacyStorageError();
  if (detection.kind === 'current') return (value as StorageEnvelope<T[]>).data;
  const version = detection.kind === 'unsupported' ? detection.version : undefined;
  throw new Error(`Unsupported CamaDB storage version${version === undefined ? '' : ` ${version}`}`);
};
