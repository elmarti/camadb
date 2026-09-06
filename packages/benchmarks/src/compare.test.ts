import { compareReports } from './compare';

const report = (samples: number[]) => ({
  config: { adapters: ['inmemory'], iterations: samples.length, sizes: [1_000] },
  results: [
    {
      adapter: 'inmemory',
      collectionSize: 1_000,
      median: { milliseconds: samples[2], perOperationMs: samples[2] },
      operation: 'point-read',
      samples: samples.map((perOperationMs) => ({ milliseconds: perOperationMs, perOperationMs })),
    },
  ],
  runtime: { architecture: 'x64', node: 'v24.0.0', platform: 'linux' },
  schemaVersion: 1,
});

const options = { absoluteToleranceMs: 0.25, relativeTolerance: 0.25 };

it('fails a material regression whose central sample ranges do not overlap', () => {
  const comparison = compareReports(
    report([1, 1.01, 1.02, 1.03, 1.04]),
    report([1.3, 1.31, 1.32, 1.33, 1.34]),
    options,
  );
  expect(comparison.regressions).toHaveLength(1);
  expect(comparison.results[0]).toMatchObject({ key: 'inmemory/1000/point-read', regression: true });
});

it('allows measurement noise within the relative or absolute tolerance', () => {
  expect(
    compareReports(report([1, 1.01, 1.02, 1.03, 1.04]), report([1.05, 1.06, 1.07, 1.08, 1.09]), options).regressions,
  ).toEqual([]);
  expect(
    compareReports(report([1, 1.01, 1.02, 1.03, 1.04]), report([1.2, 1.21, 1.22, 1.23, 1.24]), options).regressions,
  ).toEqual([]);
  expect(
    compareReports(report([0.1, 0.11, 0.12, 0.13, 0.14]), report([0.2, 0.21, 0.22, 0.23, 0.24]), options).regressions,
  ).toEqual([]);
});

it('does not call overlapping noisy distributions a regression', () => {
  const comparison = compareReports(report([0.8, 0.9, 1, 1.1, 1.2]), report([0.9, 1, 1.2, 1.3, 1.4]), options);
  expect(comparison.regressions).toEqual([]);
});

it('rejects mismatched workloads and undersampled reports', () => {
  expect(() =>
    compareReports(report([1, 1, 1, 1, 1]), { ...report([1, 1, 1, 1, 1]), engine: 'other' }, options),
  ).toThrow('Benchmark engines or workloads do not match');
  expect(() => compareReports(report([1, 1, 1]), report([1, 1, 1]), options)).toThrow(
    'Regression gating requires at least five samples',
  );
});
