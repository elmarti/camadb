# CI performance regression policy

Performance-sensitive pull requests compare the base commit and candidate commit on the same GitHub Actions runner. Both checkouts run identical workloads, Node version, dependency installation, warm-up behavior, sample count, and execution order. This is the strongest signal for the individual change.

The candidate is also compared with the committed [reviewed Linux x64/Node.js 24 floor](../../packages/benchmarks/baselines/node24-linux-x64/README.md). The manifest pins the reviewed source commit; CI rebuilds that commit and the candidate on the same runner before comparing their fresh distributions. This prevents a sequence of small, tolerated changes from silently ratcheting accepted performance down without confusing a change in hosted-runner CPU with a code regression. Historical Apple M5 reports remain useful development evidence but are not mixed with the Linux CI gate.

The initial gate covers storage, caching, metadata indexes, full-text search, exact vector search, hybrid retrieval, and the provider-independent memory API at CI-sized datasets. Larger committed workloads remain release evidence and should be rerun before a release candidate.

A result fails only when all three conditions hold:

1. candidate median time is more than 25% slower;
2. the absolute increase exceeds 0.25 ms per operation; and
3. the candidate lower quartile is slower than the baseline upper quartile.

The initial tolerance was calibrated with a same-code sequential run: a cold query differed by 17% and about 1 ms while the steady operations remained stable. It represents measurement noise, not an acceptable performance budget. A slower result inside the tolerance is not evidence of equivalence; it is too noisy to adjudicate automatically and should remain visible in the job summary. We should tighten the tolerance when accumulated CI artifacts support it.

Repeatable improvements do not automatically rewrite history. A reviewed pull request replaces all seven committed reports together, advances the manifest to the tested commit, and records the source run, environment, and rationale in the baseline README. During that pull request CI still selects the old manifest from the base branch, so the proposed floor must pass against the previously reviewed implementation on the same host. Workload or runner changes receive a new baseline directory because unlike workloads are not valid performance comparisons.

Timing is the first blocking metric because hosted-runner heap measurements and filesystem byte counts have different variance and semantics. They remain captured in every raw report. Memory becomes blocking only after repeated CI runs establish a reliable measurement method and tolerance. Raw reports are uploaded for every run so surprising results can be investigated rather than averaged away.

The gate is deliberately change-aware: it runs when core, memory, benchmarks, or their shared configuration changes. Documentation-only and unrelated application changes do not spend benchmark minutes. The normal job summary is the human-readable review surface; 30-day artifacts preserve raw diagnostics, while the committed floor is the long-lived release record.
