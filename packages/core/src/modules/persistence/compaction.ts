import { ICamaConfig } from '../../interfaces/cama-config.interface';
import { StorageStats } from '../../interfaces/persistence-adapter.interface';

export const shouldCompact = (stats: StorageStats, config: ICamaConfig): boolean => {
  const bytes = config.compaction?.minReclaimableBytes ?? 16 * 1024 * 1024;
  const ratio = config.compaction?.minReclaimableRatio ?? 0.25;
  if (!Number.isFinite(bytes) || bytes < 0 || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error('Invalid compaction thresholds');
  }
  return (
    stats.reclaimableBytes > 0 &&
    stats.reclaimableBytes >= bytes &&
    stats.reclaimableBytes / Math.max(1, stats.totalBytes) >= ratio
  );
};

/** Logical serialized bytes, not browser-engine disk allocation. */
export const serializedBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
