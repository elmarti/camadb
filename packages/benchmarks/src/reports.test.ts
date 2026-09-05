import { readFileSync } from 'fs';
import * as path from 'path';

const report = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../docs/benchmarks', name), 'utf8'));
const baseline = report('baseline-node24-apple-m5.json');
const after = report('after-wave4-node24-apple-m5.json');
const cache = report('cache-wave4-node24-apple-m5.json');
const indexBaseline = report('index-baseline-node24-apple-m5.json');
const indexAfter = report('index-after-node24-apple-m5.json');
const textSearchBaseline = report('text-search-baseline-node24-apple-m5.json');
const textSearchAfter = report('text-search-after-node24-apple-m5.json');
const textSearchBrowserBaseline = report('text-search-browser-baseline-node24-apple-m5.json');
const textSearchBrowserAfter = report('text-search-browser-after-node24-apple-m5.json');
const memoryApiBaseline = report('memory-api-baseline-node24-apple-m5.json');

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

it('retains an identical metadata-index comparison with faster steady indexed queries', () => {
  expect(indexAfter.runtime).toEqual(indexBaseline.runtime);
  expect(indexAfter.indexes).toEqual(indexBaseline.indexes);
  expect({ ...indexAfter.config, output: undefined }).toEqual({ ...indexBaseline.config, output: undefined });
  const key = (result: any) => `${result.adapter}/${result.collectionSize}/${result.operation}`;
  expect(indexAfter.results.map(key)).toEqual(indexBaseline.results.map(key));
  for (const result of indexAfter.results) expect(result.samples).toHaveLength(5);

  for (const adapter of ['fs', 'inmemory']) {
    for (const operation of ['equality-count', 'range-count', 'intersection-count']) {
      const before = indexBaseline.results.find(
        (result: any) => result.adapter === adapter && result.collectionSize === 100000 && result.operation === operation,
      );
      const current = indexAfter.results.find(
        (result: any) => result.adapter === adapter && result.collectionSize === 100000 && result.operation === operation,
      );
      expect(current.median.perOperationMs).toBeLessThan(before.median.perOperationMs);
    }
  }
});

it('records the reproducible full-text scan baseline', () => {
  expect(textSearchBaseline.runtime).toEqual(indexAfter.runtime);
  expect(textSearchBaseline.config.adapters).toEqual(['fs', 'inmemory']);
  expect(textSearchBaseline.config.sizes).toEqual([1000, 10000, 100000]);
  expect(textSearchBaseline.config.iterations).toBe(5);
  expect(textSearchBaseline.results).toHaveLength(24);
  for (const result of textSearchBaseline.results) {
    expect(result.samples).toHaveLength(5);
    expect(result.repetitions).toBe(result.operation === 'cold-selective' ? 1 : result.operation === 'common' ? 5 : 10);
    expect(result.median.perOperationMs).toBeGreaterThanOrEqual(0);
  }
});

it('retains an identical full-text comparison with faster steady queries', () => {
  expect(textSearchAfter.runtime).toEqual(textSearchBaseline.runtime);
  expect(textSearchAfter.engine).toBe('indexed');
  expect({ ...textSearchAfter.config, output: undefined }).toEqual({
    ...textSearchBaseline.config,
    output: undefined,
  });
  const key = (result: any) => `${result.adapter}/${result.collectionSize}/${result.operation}`;
  expect(textSearchAfter.results.map(key)).toEqual(textSearchBaseline.results.map(key));
  for (const result of textSearchAfter.results) expect(result.samples).toHaveLength(5);

  for (const adapter of ['fs', 'inmemory']) {
    for (const operation of ['selective', 'common', 'metadata-filtered']) {
      const before = textSearchBaseline.results.find(
        (result: any) => result.adapter === adapter && result.collectionSize === 100000 && result.operation === operation,
      );
      const current = textSearchAfter.results.find(
        (result: any) => result.adapter === adapter && result.collectionSize === 100000 && result.operation === operation,
      );
      expect(current.median.perOperationMs).toBeLessThan(before.median.perOperationMs);
    }
  }
});

it('retains the browser-adapter search comparison under deterministic API emulation', () => {
  expect(textSearchBrowserAfter.runtime).toEqual(textSearchBrowserBaseline.runtime);
  expect(textSearchBrowserBaseline.config.adapters).toEqual(['indexeddb', 'localstorage']);
  expect(textSearchBrowserBaseline.config.sizes).toEqual([1000]);
  expect(textSearchBrowserBaseline.config.iterations).toBe(5);
  expect(textSearchBrowserBaseline.results).toHaveLength(8);
  expect(textSearchBrowserAfter.results).toHaveLength(8);
  for (const result of [...textSearchBrowserBaseline.results, ...textSearchBrowserAfter.results]) {
    expect(result.samples).toHaveLength(5);
  }
  for (const adapter of ['indexeddb', 'localstorage']) {
    const before = textSearchBrowserBaseline.results.find(
      (result: any) => result.adapter === adapter && result.operation === 'selective',
    );
    const current = textSearchBrowserAfter.results.find(
      (result: any) => result.adapter === adapter && result.operation === 'selective',
    );
    expect(current.median.perOperationMs).toBeLessThan(before.median.perOperationMs);
  }
});

it('retains the complete provider-independent memory API baseline', () => {
  expect(memoryApiBaseline.runtime).toEqual(after.runtime);
  expect(memoryApiBaseline.config.adapters).toEqual(['fs', 'inmemory']);
  expect(memoryApiBaseline.config.sizes).toEqual([100, 1000, 10000]);
  expect(memoryApiBaseline.config.iterations).toBe(5);
  expect(memoryApiBaseline.workload).toEqual({ batchSize: 10000, dimensions: 32, limit: 10 });
  expect(memoryApiBaseline.results).toHaveLength(30);
  for (const result of memoryApiBaseline.results) {
    expect(result.samples).toHaveLength(5);
    expect(result.repetitions).toBe(result.operation === 'inspect' ? 100 :
      result.operation === 'batch-remember' ? 1 : 10);
    expect(result.median.perOperationMs).toBeGreaterThanOrEqual(0);
  }
});
