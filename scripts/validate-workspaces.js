const path = require('path');
const { spawnSync } = require('child_process');
const { loadWorkspaces } = require('./affected-workspaces');

const root = path.resolve(__dirname, '..');
const workspaces = loadWorkspaces(root);
const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
const requested = JSON.parse(process.env.AFFECTED_WORKSPACES || '[]');
const affected = new Set(requested);
const buildOnly = process.argv.includes('--build-only');

for (const name of affected) if (!byName.has(name)) throw new Error(`Unknown affected workspace: ${name}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

function dependenciesOf(workspace) {
  const dependencies = {
    ...workspace.manifest.dependencies,
    ...workspace.manifest.devDependencies,
    ...workspace.manifest.peerDependencies,
  };
  return Object.keys(dependencies).filter((name) => byName.has(name));
}

const buildSet = new Set(affected);
function includeDependencies(name) {
  for (const dependency of dependenciesOf(byName.get(name))) {
    if (buildSet.has(dependency)) continue;
    buildSet.add(dependency);
    includeDependencies(dependency);
  }
}
for (const name of affected) includeDependencies(name);

const ordered = [];
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  visited.add(name);
  for (const dependency of dependenciesOf(byName.get(name))) if (buildSet.has(dependency)) visit(dependency);
  ordered.push(name);
}
for (const name of buildSet) visit(name);

if (!buildOnly) {
  for (const name of ordered.filter((item) => affected.has(item))) {
    const scripts = byName.get(name).manifest.scripts || {};
    if (scripts.typecheck) run('yarn', ['workspace', name, 'typecheck']);
    else if (scripts.compile) run('yarn', ['workspace', name, 'compile']);
  }
  if (affected.has('@camadb/core')) {
    run('yarn', ['tsc', '--project', 'packages/core/tsconfig.type-tests.json', '--pretty', 'false']);
  }

  const paths = workspaces.filter(({ name }) => affected.has(name)).map(({ directory }) => directory);
  run('yarn', ['eslint', ...paths, '--ext', '.js,.ts,.tsx', '--no-error-on-unmatched-pattern']);
  run('yarn', ['jest', '--config', 'jest.config.js', '--runInBand', '--passWithNoTests', ...paths]);
  run('yarn', ['check:boundaries']);
  run('yarn', ['check:packages']);
}

for (const name of ordered) {
  if (byName.get(name).manifest.scripts?.build) run('yarn', ['workspace', name, 'build']);
}

if (!buildOnly && workspaces.some(({ name, manifest }) => affected.has(name) && !manifest.private)) {
  run('yarn', ['test:integration']);
  run('yarn', ['test:packages']);
  run('node', ['scripts/publish-workspaces.js', '--dry-run']);
}
