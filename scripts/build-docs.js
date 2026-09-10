const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const output = outIndex < 0 ? 'apps/website/out/docs' : args[outIndex + 1];
if (!output) throw new Error('--out requires a destination');
function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(path.join(path.dirname(require.resolve('typedoc/package.json')), 'bin/typedoc'), [
  '--options',
  'typedoc.json',
  ...args,
]);
run(path.join(__dirname, 'check-doc-links.js'), [output]);
