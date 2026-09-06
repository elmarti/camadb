import { promises as fs } from 'fs';
import * as path from 'path';

interface BenchmarkSample {
  milliseconds: number;
  perOperationMs?: number;
  perReadMilliseconds?: number;
}

interface BenchmarkResult {
  adapter: string;
  collectionSize: number;
  median?: BenchmarkSample;
  mode?: string;
  operation?: string;
  samples: BenchmarkSample[];
  workload?: string;
}

interface BenchmarkReport {
  config: {
    adapters: string[];
    iterations: number;
    output?: string;
    sizes: number[];
  };
  engine?: string;
  results: BenchmarkResult[];
  runtime: {
    architecture: string;
    node: string;
    platform: string;
  };
  schemaVersion: number;
  workload?: Record<string, unknown>;
}

export interface ComparisonOptions {
  absoluteToleranceMs: number;
  relativeTolerance: number;
}

export interface ResultComparison {
  baselineMs: number;
  candidateMs: number;
  change: number;
  key: string;
  regression: boolean;
}

export interface ReportComparison {
  results: ResultComparison[];
  regressions: ResultComparison[];
}

const timing = (sample: BenchmarkSample): number =>
  sample.perOperationMs ?? sample.perReadMilliseconds ?? sample.milliseconds;

const percentile = (samples: BenchmarkSample[], fraction: number): number => {
  const sorted = samples.map(timing).sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};

const resultKey = (result: BenchmarkResult): string =>
  [result.adapter, result.collectionSize, result.operation ?? result.workload, result.mode]
    .filter((part) => part !== undefined)
    .join('/');

const comparableConfig = ({ output: _output, ...config }: BenchmarkReport['config']) => config;

export const compareReports = (
  baseline: BenchmarkReport,
  candidate: BenchmarkReport,
  options: ComparisonOptions,
): ReportComparison => {
  if (baseline.schemaVersion !== candidate.schemaVersion) throw new Error('Benchmark schema versions do not match');
  if (
    baseline.runtime.architecture !== candidate.runtime.architecture ||
    baseline.runtime.platform !== candidate.runtime.platform
  ) {
    throw new Error('Benchmark reports must be produced on the same platform and architecture');
  }
  if (JSON.stringify(comparableConfig(baseline.config)) !== JSON.stringify(comparableConfig(candidate.config))) {
    throw new Error('Benchmark configurations do not match');
  }
  if (
    baseline.engine !== candidate.engine ||
    JSON.stringify(baseline.workload) !== JSON.stringify(candidate.workload)
  ) {
    throw new Error('Benchmark engines or workloads do not match');
  }
  if (baseline.config.iterations < 5 || candidate.config.iterations < 5) {
    throw new Error('Regression gating requires at least five samples');
  }

  const candidateByKey = new Map(candidate.results.map((result) => [resultKey(result), result]));
  if (candidateByKey.size !== baseline.results.length || candidate.results.length !== baseline.results.length) {
    throw new Error('Benchmark result sets do not match');
  }

  const results = baseline.results.map((baselineResult): ResultComparison => {
    const key = resultKey(baselineResult);
    const candidateResult = candidateByKey.get(key);
    if (!candidateResult) throw new Error(`Candidate benchmark is missing ${key}`);
    if (baselineResult.samples.length < 5 || candidateResult.samples.length < 5) {
      throw new Error(`${key} requires at least five samples`);
    }
    const baselineMs = percentile(baselineResult.samples, 0.5);
    const candidateMs = percentile(candidateResult.samples, 0.5);
    const change = baselineMs === 0 ? Number.POSITIVE_INFINITY : (candidateMs - baselineMs) / baselineMs;
    const regression =
      change > options.relativeTolerance &&
      candidateMs - baselineMs > options.absoluteToleranceMs &&
      percentile(candidateResult.samples, 0.25) > percentile(baselineResult.samples, 0.75);
    return { baselineMs, candidateMs, change, key, regression };
  });
  return { regressions: results.filter(({ regression }) => regression), results };
};

const parseArguments = (args: string[]): { baseline: string; candidate: string; options: ComparisonOptions } => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) values.set(args[index], args[index + 1]);
  const baseline = values.get('--baseline');
  const candidate = values.get('--candidate');
  if (!baseline || !candidate) throw new Error('--baseline and --candidate directories are required');
  const relativeTolerance = Number(values.get('--relative-tolerance') ?? '0.25');
  const absoluteToleranceMs = Number(values.get('--absolute-tolerance-ms') ?? '0.25');
  if (!(relativeTolerance >= 0) || !(absoluteToleranceMs >= 0)) throw new Error('Tolerances must be non-negative');
  return { baseline, candidate, options: { absoluteToleranceMs, relativeTolerance } };
};

const markdown = (comparisons: Array<{ name: string; report: ReportComparison }>): string => {
  const rows = comparisons.flatMap(({ name, report }) =>
    report.results.map(
      (result) =>
        `| ${name} | ${result.key} | ${result.baselineMs.toFixed(3)} | ${result.candidateMs.toFixed(3)} | ${(result.change * 100).toFixed(1)}% | ${result.regression ? 'FAIL' : 'pass'} |`,
    ),
  );
  return [
    '## Performance regression comparison',
    '',
    '| Workload | Result | Base ms/op | PR ms/op | Change | Gate |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...rows,
    '',
  ].join('\n');
};

const main = async (): Promise<void> => {
  const { baseline, candidate, options } = parseArguments(process.argv.slice(2));
  const files = (await fs.readdir(baseline)).filter((file) => file.endsWith('.json')).sort();
  const candidateFiles = (await fs.readdir(candidate)).filter((file) => file.endsWith('.json')).sort();
  if (JSON.stringify(files) !== JSON.stringify(candidateFiles)) throw new Error('Benchmark report files do not match');
  const comparisons = await Promise.all(
    files.map(async (file) => ({
      name: path.basename(file, '.json'),
      report: compareReports(
        JSON.parse(await fs.readFile(path.join(baseline, file), 'utf8')) as BenchmarkReport,
        JSON.parse(await fs.readFile(path.join(candidate, file), 'utf8')) as BenchmarkReport,
        options,
      ),
    })),
  );
  const output = markdown(comparisons);
  process.stdout.write(output);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, output);
  const regressionCount = comparisons.reduce((total, comparison) => total + comparison.report.regressions.length, 0);
  if (regressionCount > 0)
    throw new Error(`${regressionCount} statistically separated performance regression(s) detected`);
};

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
