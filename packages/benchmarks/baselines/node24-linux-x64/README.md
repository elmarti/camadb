# Reviewed CI performance floor

These seven reports are the reviewed Linux x64/Node.js 24 performance floor for
CamaDB 3. They were produced by the candidate checkout in CI run
[34050866284](https://github.com/elmarti/camadb/actions/runs/34050866284) for
[PR #130](https://github.com/elmarti/camadb/pull/130), commit
`f9ef4955776e8a8fa65ad019c50eb0aa4ef20992`, on 6 September 2026.

The reports retain every sample plus the Node version, CPU, architecture,
platform, and available memory reported by the GitHub-hosted runner. The
absolute output paths are historical metadata and are excluded from comparison.

The adjacent manifest pins the source commit. CI rebuilds that commit and the
candidate on the same GitHub runner, then compares their fresh distributions.
It also compares the PR base and candidate. This avoids mistaking a change in
host CPU for a code regression while ensuring a sequence of individually small
regressions cannot silently make the accepted floor slower. Raw per-run
artifacts remain diagnostic and expire after 30 days; this directory is the
durable release record.

Update this floor only when:

1. the workloads and runner class are unchanged;
2. the candidate is no slower under the documented statistical gate;
3. the full raw candidate reports replace all seven files together;
4. the adjacent manifest points to that tested commit; and
5. the pull request records its source run, commit, environment, and rationale.

A workload or runner change establishes a new, separately named baseline
directory. It must not overwrite this evidence or pretend unlike measurements
are comparable.
