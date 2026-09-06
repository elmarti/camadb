import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

interface Workload {
  args: string[];
  file: string;
  runner: string;
}

const workloads: Workload[] = [
  { args: ['--sizes', '100,1000', '--iterations', '5'], file: 'storage.json', runner: 'run.js' },
  { args: ['--sizes', '100,1000', '--iterations', '5'], file: 'cache.json', runner: 'cache-run.js' },
  { args: ['--sizes', '1000,10000', '--iterations', '5'], file: 'metadata.json', runner: 'index-run.js' },
  {
    args: ['--engine', 'indexed', '--sizes', '1000,10000', '--iterations', '5'],
    file: 'text.json',
    runner: 'text-search-run.js',
  },
  {
    args: ['--engine', 'bounded', '--dimensions', '32', '--sizes', '1000,10000', '--iterations', '5'],
    file: 'vector.json',
    runner: 'vector-search-run.js',
  },
  {
    args: ['--engine', 'native', '--sizes', '1000,10000', '--iterations', '5'],
    file: 'hybrid.json',
    runner: 'hybrid-search-run.js',
  },
  { args: ['--sizes', '100,1000', '--iterations', '5'], file: 'memory.json', runner: 'memory-run.js' },
];

const main = async (): Promise<void> => {
  const outputIndex = process.argv.indexOf('--output-dir');
  const outputDirectory = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
  if (!outputDirectory) throw new Error('--output-dir is required');
  const runnerIndex = process.argv.indexOf('--runner-dir');
  const runnerDirectory = path.resolve(
    process.env.INIT_CWD ?? process.cwd(),
    runnerIndex === -1 ? __dirname : process.argv[runnerIndex + 1],
  );
  const absoluteOutput = path.resolve(process.env.INIT_CWD ?? process.cwd(), outputDirectory);
  await fs.mkdir(absoluteOutput, { recursive: true });

  for (const workload of workloads) {
    process.stdout.write(`Running ${workload.file}\n`);
    const result = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        path.join(runnerDirectory, workload.runner),
        ...workload.args,
        '--output',
        path.join(absoluteOutput, workload.file),
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error(`${workload.file} benchmark failed`);
  }
};

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
