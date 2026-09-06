import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [baselineRoot, candidateRoot, output] = process.argv.slice(2);
if (!output)
  throw new Error('Usage: compare.mjs BASELINE_PACKAGE_ROOT CANDIDATE_PACKAGE_ROOT EXISTING_OUTPUT_DIRECTORY');
const profile = fileURLToPath(new URL('./profile.mjs', import.meta.url));
for (const [label, root, shape, cache, page] of [
  ['baseline-100k-repeat', baselineRoot, 'narrow', 'lru', 'parallel'],
  ['after-100k-repeat', candidateRoot, 'narrow', 'lru', 'parallel'],
  ['baseline-100k-serial', baselineRoot, 'narrow', 'lru', 'serial'],
  ['after-100k-serial', candidateRoot, 'narrow', 'lru', 'serial'],
  ['baseline-100k-disabled', baselineRoot, 'narrow', 'disabled', 'parallel'],
  ['after-100k-disabled', candidateRoot, 'narrow', 'disabled', 'parallel'],
  ['baseline-100k-wide', baselineRoot, 'wide', 'lru', 'parallel'],
  ['after-100k-wide', candidateRoot, 'wide', 'lru', 'parallel'],
]) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=512',
        profile,
        root,
        path.join(output, `${label}.json`),
        '100000',
        shape,
        cache,
        page,
      ],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`))));
  });
}
