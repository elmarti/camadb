export type CacheMode = 'disabled' | 'eager' | 'lazy' | 'lru';

export interface CacheConfig {
  mode: CacheMode;
  /** UTF-8 serialized record and ID bytes, not JavaScript heap usage. Default: 8 MiB. */
  maxBytes?: number;
  /** Maximum resident records. Default: 1,000. */
  maxRecords?: number;
}

export interface CacheStats {
  mode: CacheMode;
  maxBytes: number;
  maxRecords: number;
  bytes: number;
  records: number;
  hits: number;
  misses: number;
  evictions: number;
  skipped: number;
  invalidations: number;
}
