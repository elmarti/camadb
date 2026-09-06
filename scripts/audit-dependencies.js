const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'security/tooling-audit-allowlist.json'), 'utf8'));
const blockingSeverities = new Set(['high', 'critical']);

function audit(args) {
  const result = spawnSync('yarn', ['audit', '--json', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const events = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const summary = events.find(({ type }) => type === 'auditSummary')?.data;
  if (!summary) throw new Error(`The registry did not return an audit summary.\n${result.stderr}`);
  const advisories = new Map();
  for (const event of events) {
    if (event.type !== 'auditAdvisory') continue;
    const advisory = event.data.advisory;
    advisories.set(advisory.github_advisory_id, {
      id: advisory.github_advisory_id,
      module: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
    });
  }
  return { advisories, summary };
}

const production = audit(['--groups', 'dependencies']);
const productionBlockers = [...production.advisories.values()].filter(({ severity }) =>
  blockingSeverities.has(severity),
);
if (productionBlockers.length > 0) {
  throw new Error(
    `Production dependency blockers:\n${productionBlockers.map(({ id, module }) => `- ${id} ${module}`).join('\n')}`,
  );
}

const workspace = audit([]);
const allowed = new Set(policy.advisories.map(({ id }) => id));
const unreviewed = [...workspace.advisories.values()].filter(
  ({ id, severity }) => blockingSeverities.has(severity) && !allowed.has(id),
);
const activeAccepted = policy.advisories.filter(({ id }) => workspace.advisories.has(id));
const resolvedAccepted = policy.advisories.filter(({ id }) => !workspace.advisories.has(id));
const expired = Date.now() > Date.parse(`${policy.expiresAt}T23:59:59.999Z`);

const vulnerabilitySummary = (summary) =>
  ['critical', 'high', 'moderate', 'low']
    .map((severity) => `${severity}: ${summary.vulnerabilities[severity]}`)
    .join(', ');
const rows = [...workspace.advisories.values()]
  .sort((left, right) => left.id.localeCompare(right.id))
  .map(
    ({ id, module, severity }) =>
      `| ${id} | ${module} | ${severity} | ${allowed.has(id) ? 'accepted tooling risk' : 'informational'} |`,
  );
const report = [
  '## Dependency security audit',
  '',
  `Published runtime graph: ${vulnerabilitySummary(production.summary)}.`,
  '',
  `Complete build/test graph: ${vulnerabilitySummary(workspace.summary)}. Counts include repeated dependency paths; ${workspace.advisories.size} unique advisories were reported.`,
  '',
  '| Advisory | Module | Severity | Decision |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
  `Tooling risk review expires: ${policy.expiresAt}.`,
  '',
].join('\n');
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

if (unreviewed.length > 0) {
  throw new Error(
    `Unreviewed high/critical tooling advisories:\n${unreviewed.map(({ id, module }) => `- ${id} ${module}`).join('\n')}`,
  );
}
if (expired && activeAccepted.length > 0) throw new Error('The tooling security risk acceptance has expired');
if (resolvedAccepted.length > 0) {
  process.stdout.write(
    `Remove resolved advisories from the allow-list: ${resolvedAccepted.map(({ id }) => id).join(', ')}\n`,
  );
}
