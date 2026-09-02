/** Fixed, deterministic identity workloads; independent of adapter and cache mode. */
export const cacheWorkload = (size: number, kind: 'hot' | 'scan'): string[] => {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Collection size must be positive');
  const width = Math.min(size, kind === 'hot' ? 32 : 128);
  return Array.from({ length: 256 }, (_, index) => String(index % width));
};
