import { readFileSync } from 'fs';
import * as path from 'path';

const report = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../docs/benchmarks', name), 'utf8'));
const baseline = report('baseline-node24-apple-m5.json');
const after = report('after-wave4-node24-apple-m5.json');
const cache = report('cache-wave4-node24-apple-m5.json');
const indexBaseline = report('index-baseline-node24-apple-m5.json');

it('preserves matching environments, settings, and all before/after samples', () => {
  expect(after.runtime).toEqual(baseline.runtime);
  expect(after.config.adapters).toEqual(baseline.config.adapters);
  expect(after.config.sizes).toEqual(baseline.config.sizes);
  expect(after.config.iterations).toBe(baseline.config.iterations);
  const keys = (data: typeof after) =>
    data.results.map((row: any) => `${row.adapter}/${row.collectionSize}/${row.operation}`);
  expect(keys(after)).toEqual(keys(baseline));
  expect(new Set(keys(after)).size).toBe(24);
  for (const row of after.results) {
    expect(row.samples).toHaveLength(5);
    for (const key of ['milliseconds', 'heapDeltaBytes', 'collectionBytes']) {
      const sorted = row.samples.map((sample: any) => sample[key]).sort((a: number, b: number) => a - b);
      expect(row.median[key]).toBe(sorted[2]);
    }
  }
});

it('records the complete cache matrix with validated budgets and lookup accounting', () => {
  expect(cache.runtime).toEqual(after.runtime);
  expect(cache.config.iterations).toBe(5);
  expect(cache.readsPerSample).toBe(256);
  expect(cache.results).toHaveLength(48);
  expect(
    new Set(cache.results.map((row: any) => `${row.adapter}/${row.collectionSize}/${row.workload}/${row.mode}`)).size,
  ).toBe(48);
  for (const row of cache.results) {
    expect(row.samples).toHaveLength(5);
    for (const sample of row.samples) {
      expect(sample.cache.records).toBeLessThanOrEqual(cache.budget.maxRecords);
      expect(sample.cache.bytes).toBeLessThanOrEqual(cache.budget.maxBytes);
      expect(sample.milliseconds).toBeGreaterThanOrEqual(0);
      expect(sample.warmMilliseconds).toBeGreaterThanOrEqual(0);
      expect(sample.readCounters.hits + sample.readCounters.misses).toBe(row.mode === 'disabled' ? 0 : 256);
    }
  }
});

it('records reproducible unindexed equality and range query baselines', () => {
  expect(indexBaseline.runtime).toEqual(after.runtime);
  expect(indexBaseline.indexes).toEqual(['group', 'score']);
  expect(indexBaseline.config.adapters).toEqual(['fs', 'inmemory']);
  expect(indexBaseline.config.sizes).toEqual([1000, 10000, 100000]);
  expect(indexBaseline.config.iterations).toBe(5);
  expect(indexBaseline.results).toHaveLength(30);
  for (const result of indexBaseline.results) {
    expect(result.samples).toHaveLength(5);
    expect(result.repetitions).toBe(
      result.operation === 'cold-equality-count' ? 1 : result.operation === 'unindexed-miss-count' ? 5 : 20,
    );
    expect(result.median.perOperationMs).toBeGreaterThanOrEqual(0);
  }
});
