import { cacheWorkload } from './cache-workload';

it('repeats a fitting hot set identically', () => {
  const ids = cacheWorkload(1000, 'hot');
  expect(ids).toHaveLength(256);
  expect(new Set(ids).size).toBe(32);
  expect(ids.slice(0, 32)).toEqual(ids.slice(32, 64));
  expect(ids).toEqual(cacheWorkload(1000, 'hot'));
});

it('exceeds the 64-record budget without requesting nonexistent identities', () => {
  expect(new Set(cacheWorkload(1000, 'scan')).size).toBe(128);
  expect(new Set(cacheWorkload(100, 'scan')).size).toBe(100);
  expect(new Set(cacheWorkload(1, 'scan'))).toEqual(new Set(['0']));
  expect(() => cacheWorkload(0, 'hot')).toThrow('positive');
});
