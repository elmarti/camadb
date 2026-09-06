const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadWorkspaces } = require('./affected-workspaces');

const root = path.resolve(__dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, '.changeset/pre.json'), 'utf8'));

assert.strictEqual(state.mode, 'pre', 'Changesets must be in prerelease mode');
assert.strictEqual(state.tag, 'rc', 'Changesets prerelease tag must be rc');

const publicWorkspaces = loadWorkspaces(root).filter(({ manifest }) => !manifest.private);
for (const { manifest, name } of publicWorkspaces) {
  assert.match(manifest.version, /-rc\.\d+$/, `${name} must have a committed rc.N version`);
}

const versions = publicWorkspaces.map(({ manifest, name }) => `| ${name} | ${manifest.version} |`);
const report = ['## Release candidate versions', '', '| Package | Version |', '| --- | ---: |', ...versions, ''].join(
  '\n',
);

process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
