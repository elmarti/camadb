const { execFileSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const run = (script, args = []) => execFileSync(process.execPath, ['--expose-gc', path.join(__dirname, script), ...args], { cwd: root, stdio: 'inherit' });
run('check.js');
run('hash-benchmark.js');
run('run-storage.js');
for (const [candidate, name] of [
  ['baseline', 'mixed-baseline'], ['map', 'mixed-map'], ['lookup', 'mixed-lookup'],
  ['lookup', 'mixed-lookup-repeat'], ['map', 'mixed-map-repeat'], ['baseline', 'mixed-baseline-repeat'],
]) run('mixed.js', [candidate, `docs/benchmarks/speed-lab/${name}.json`]);
run('summarize.js');
