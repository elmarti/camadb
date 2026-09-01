export type AdapterName = 'fs' | 'inmemory';

export interface BenchmarkConfig {
  adapters: AdapterName[];
  iterations: number;
  output?: string;
  sizes: number[];
}

const positiveInteger = (value: string, option: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must contain positive integers`);
  }
  return parsed;
};

export const parseConfig = (args: string[]): BenchmarkConfig => {
  const config: BenchmarkConfig = {
    adapters: ['fs', 'inmemory'],
    iterations: 5,
    sizes: [100, 1_000, 10_000],
  };

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`${option} requires a value`);

    if (option === '--adapter') {
      const adapters = value.split(',');
      if (adapters.some((adapter) => adapter !== 'fs' && adapter !== 'inmemory')) {
        throw new Error('--adapter must be fs, inmemory, or both');
      }
      config.adapters = adapters as AdapterName[];
    } else if (option === '--iterations') {
      config.iterations = positiveInteger(value, option);
    } else if (option === '--output') {
      config.output = value;
    } else if (option === '--sizes') {
      config.sizes = value.split(',').map((size) => positiveInteger(size, option));
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
    index += 1;
  }

  return config;
};
