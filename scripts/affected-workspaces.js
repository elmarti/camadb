const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function loadWorkspaces(workspaceRoot = root) {
  const rootManifest = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'));
  return rootManifest.workspaces.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) throw new Error(`Unsupported workspace pattern: ${pattern}`);
    const parent = path.join(workspaceRoot, pattern.slice(0, -2));
    if (!fs.existsSync(parent)) return [];
    return fs
      .readdirSync(parent)
      .map((entry) => path.join(parent, entry))
      .filter((directory) => fs.existsSync(path.join(directory, 'package.json')))
      .map((directory) => {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        return {
          name: manifest.name,
          directory: path.relative(workspaceRoot, directory).replaceAll(path.sep, '/'),
          manifest,
        };
      });
  });
}

function changesetPackages(file, workspaceRoot = root) {
  const absolute = path.join(workspaceRoot, file);
  if (!fs.existsSync(absolute) || !file.endsWith('.md')) return [];
  const source = fs.readFileSync(absolute, 'utf8');
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter) return [];
  return [...frontmatter[1].matchAll(/["']([^"']+)["']\s*:/g)].map((match) => match[1]);
}

function resolveAffectedWorkspaces(changedFiles, workspaces = loadWorkspaces(), workspaceRoot = root) {
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const direct = new Set();
  let globalChange = false;
  let conditionalRootChange = false;

  for (const file of changedFiles) {
    const normalized = file.replaceAll('\\', '/');
    const owner = workspaces.find(
      (workspace) => normalized === workspace.directory || normalized.startsWith(`${workspace.directory}/`),
    );
    if (owner) {
      direct.add(owner.name);
      continue;
    }
    if (normalized.startsWith('.changeset/')) {
      for (const name of changesetPackages(normalized, workspaceRoot)) if (byName.has(name)) direct.add(name);
      continue;
    }
    if (
      normalized.startsWith('docs/') ||
      normalized === 'README.md' ||
      normalized === 'LICENSE' ||
      normalized.startsWith('.github/ISSUE_TEMPLATE/')
    ) {
      continue;
    }
    if (normalized === 'package.json' || normalized === 'yarn.lock') {
      conditionalRootChange = true;
      continue;
    }
    globalChange = true;
  }

  if (globalChange || (conditionalRootChange && direct.size === 0)) {
    return workspaces.map(({ name }) => name).sort();
  }

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const workspace of workspaces) {
      if (direct.has(workspace.name)) continue;
      const dependencies = {
        ...workspace.manifest.dependencies,
        ...workspace.manifest.devDependencies,
        ...workspace.manifest.peerDependencies,
      };
      if (Object.keys(dependencies).some((name) => direct.has(name))) {
        direct.add(workspace.name);
        expanded = true;
      }
    }
  }
  return [...direct].sort();
}

function changedFiles(base, head) {
  if (!base || !head) throw new Error('Usage: affected-workspaces.js <base> <head>');
  const validBase = /^0+$/.test(base) ? `${head}^` : base;
  return execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${validBase}...${head}`], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
}

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  const affected =
    base === '--all'
      ? loadWorkspaces()
          .map(({ name }) => name)
          .sort()
      : resolveAffectedWorkspaces(changedFiles(base, head));
  process.stdout.write(JSON.stringify(affected));
}

module.exports = { loadWorkspaces, resolveAffectedWorkspaces };
