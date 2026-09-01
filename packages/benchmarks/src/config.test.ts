import { parseConfig } from './config';

describe('benchmark configuration', () => {
  it('uses reproducible defaults', () => {
    expect(parseConfig([])).toEqual({
      adapters: ['fs', 'inmemory'],
      iterations: 5,
      sizes: [100, 1_000, 10_000],
    });
  });

  it('parses workload overrides', () => {
    expect(
      parseConfig(['--adapter', 'fs', '--sizes', '10,20', '--iterations', '3', '--output', 'result.json']),
    ).toEqual({ adapters: ['fs'], iterations: 3, output: 'result.json', sizes: [10, 20] });
  });

  it('rejects invalid sizes', () => {
    expect(() => parseConfig(['--sizes', '0'])).toThrow('--sizes must contain positive integers');
  });
});
