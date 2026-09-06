const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadWorkspaces } = require('./affected-workspaces');

const root = path.resolve(__dirname, '..');
const publicWorkspaces = loadWorkspaces(root).filter(({ manifest }) => !manifest.private);
const publicByName = new Map(publicWorkspaces.map((workspace) => [workspace.name, workspace]));

function packContents(workspace) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: path.join(root, workspace.directory),
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'camadb-release-audit-npm-cache') },
  });
  if (result.status !== 0) throw new Error(result.stderr || `Could not inspect ${workspace.name}`);
  return JSON.parse(result.stdout)[0]
    .files.map(({ path: file }) => file)
    .sort();
}

const rows = [];
for (const workspace of publicWorkspaces) {
  const { manifest, name } = workspace;
  assert.strictEqual(manifest.engines?.node, '>=22', `${name} must declare Node.js >=22`);
  assert.strictEqual(manifest.publishConfig?.access, 'public', `${name} must publish publicly`);
  assert.strictEqual(manifest.publishConfig?.provenance, true, `${name} must request npm provenance`);
  assert.ok(manifest.exports?.['.']?.types, `${name} must export types`);
  assert.ok(manifest.exports?.['.']?.import, `${name} must export ESM imports`);
  assert.ok(manifest.exports?.['.']?.require, `${name} must export CommonJS`);

  for (const [dependency, range] of Object.entries(manifest.dependencies || {})) {
    const internal = publicByName.get(dependency);
    if (internal)
      assert.strictEqual(range, internal.manifest.version, `${name} must pin ${dependency} to its package version`);
  }

  const files = packContents(workspace);
  for (const required of ['README.md', 'dist/index.d.ts', 'dist/index.js', 'package.json']) {
    assert.ok(files.includes(required), `${name} package is missing ${required}`);
  }
  const unexpected = files.filter(
    (file) => file !== 'README.md' && file !== 'package.json' && !file.startsWith('dist/'),
  );
  assert.deepStrictEqual(unexpected, [], `${name} contains files outside its reviewed allow-list`);
  rows.push(`| ${name} | ${manifest.version} | ${files.length} | Node >=22 | enabled |`);
}

const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yaml'), 'utf8');
const releaseCandidateWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release-rc.yaml'), 'utf8');
const alphaWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release-alpha.yaml'), 'utf8');
assert.match(releaseWorkflow, /id-token:\s*write/, 'Stable publishing must grant OIDC identity-token permission');
assert.match(releaseWorkflow, /registry-url:\s*https:\/\/registry\.npmjs\.org/, 'Stable publishing must target npm');
assert.match(releaseWorkflow, /yarn install --frozen-lockfile/, 'Stable publishing must use the reviewed lockfile');
assert.match(releaseCandidateWorkflow, /workflow_dispatch:/, 'RC publishing must require a manual dispatch');
assert.match(releaseCandidateWorkflow, /github\.ref == 'refs\/heads\/develop'/, 'RC publishing must use develop');
assert.match(releaseCandidateWorkflow, /id-token:\s*write/, 'RC publishing must grant OIDC identity-token permission');
assert.match(releaseCandidateWorkflow, /yarn release:check/, 'RC publishing must run the complete release gate');
assert.match(releaseCandidateWorkflow, /yarn release:rc/, 'RC publishing must use the rc npm tag');
assert.match(
  releaseCandidateWorkflow,
  /yarn test:packages:published/,
  'RC publishing must smoke-test registry packages',
);
assert.match(alphaWorkflow, /\[ -f \.changeset\/pre\.json \]/, 'Alpha publishing must detect committed RC mode');
assert.match(
  alphaWorkflow,
  /steps\.release-mode\.outputs\.alpha == 'true'/,
  'Alpha publishing steps must be disabled during RC mode',
);

const prereleasePath = path.join(root, '.changeset/pre.json');
if (fs.existsSync(prereleasePath)) {
  const prereleaseState = JSON.parse(fs.readFileSync(prereleasePath, 'utf8'));
  assert.ok(['pre', 'exit'].includes(prereleaseState.mode), 'Changesets prerelease state must be pre or exit');
  assert.strictEqual(prereleaseState.tag, 'rc', 'The release branch prerelease tag must be rc');
  if (prereleaseState.mode === 'pre') {
    for (const { manifest, name } of publicWorkspaces) {
      assert.match(manifest.version, /-rc\.\d+$/, `${name} must carry a committed rc.N version`);
    }
  }
}

const report = [
  '## Release package audit',
  '',
  '| Package | Current version | Packed files | Runtime | npm provenance |',
  '| --- | ---: | ---: | --- | --- |',
  ...rows,
  '',
].join('\n');
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
