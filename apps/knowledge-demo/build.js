const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const root = __dirname;
const output = path.join(root, 'dist');

fs.rmSync(output, { force: true, recursive: true });
fs.mkdirSync(output, { recursive: true });

buildSync({
  absWorkingDir: root,
  alias: {
    '@camadb/core': path.join(root, '../../packages/core/src/index.ts'),
    '@camadb/memory': path.join(root, '../../packages/memory/src/index.ts'),
    crypto: path.join(root, 'src/node-builtins.ts'),
    fs: path.join(root, 'src/node-builtins.ts'),
    path: path.join(root, 'src/node-builtins.ts'),
  },
  bundle: true,
  entryPoints: ['src/main.ts'],
  format: 'esm',
  loader: { '.css': 'css' },
  logLevel: 'info',
  minify: true,
  outfile: path.join(output, 'app.js'),
  platform: 'browser',
  sourcemap: true,
  target: ['es2022'],
});

for (const file of ['index.html', 'manifest.webmanifest', 'service-worker.js']) {
  fs.copyFileSync(path.join(root, 'public', file), path.join(output, file));
}

console.log('Built the offline knowledge demo in apps/knowledge-demo/dist.');
