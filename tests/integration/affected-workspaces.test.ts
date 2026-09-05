const path = require('path');
const { loadWorkspaces, resolveAffectedWorkspaces } = require('../../scripts/affected-workspaces');

const root = path.resolve(__dirname, '../..');
const workspaces = loadWorkspaces(root);

it('limits app-only changes even when their manifest updates the root lockfile', () => {
  expect(
    resolveAffectedWorkspaces(
      ['apps/studio/src/panel.ts', 'apps/studio/package.json', 'package.json', 'yarn.lock'],
      workspaces,
      root,
    ),
  ).toEqual(['@camadb/studio']);
});

it('includes every downstream workspace when a shared package changes', () => {
  expect(resolveAffectedWorkspaces(['packages/design/src/index.css'], workspaces, root)).toEqual([
    '@camadb/design',
    '@camadb/knowledge-demo',
    '@camadb/studio',
    '@camadb/website',
  ]);
  expect(resolveAffectedWorkspaces(['packages/core/src/index.ts'], workspaces, root)).toEqual(
    expect.arrayContaining([
      '@camadb/benchmarks',
      '@camadb/core',
      '@camadb/example-basic',
      '@camadb/knowledge-demo',
      '@camadb/memory',
      'camadb',
    ]),
  );
});

it('skips documentation and treats shared CI configuration conservatively', () => {
  expect(resolveAffectedWorkspaces(['docs/decisions/example.md'], workspaces, root)).toEqual([]);
  expect(resolveAffectedWorkspaces(['.github/workflows/ci.yaml'], workspaces, root)).toHaveLength(workspaces.length);
});
