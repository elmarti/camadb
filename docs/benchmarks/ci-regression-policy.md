# CI performance regression policy

Performance-sensitive pull requests compare the base commit and candidate commit on the same GitHub Actions runner. Both checkouts run identical workloads, Node version, dependency installation, warm-up behavior, sample count, and execution order. This avoids comparing variable hosted runners with the historical Apple M5 reports.

The initial gate covers storage, caching, metadata indexes, full-text search, exact vector search, hybrid retrieval, and the provider-independent memory API at CI-sized datasets. Larger committed workloads remain release evidence and should be rerun before a release candidate.

A result fails only when all three conditions hold:

1. candidate median time is more than 25% slower;
2. the absolute increase exceeds 0.25 ms per operation; and
3. the candidate lower quartile is slower than the baseline upper quartile.

The initial tolerance was calibrated with a same-code sequential run: a cold query differed by 17% and about 1 ms while the steady operations remained stable. It represents measurement noise, not an acceptable performance budget. A repeatable improvement should be retained by the codebase and naturally becomes the base comparison after merge. A slower result inside the tolerance is not evidence of equivalence; it is too noisy to adjudicate automatically and should remain visible in the job summary. We should tighten the tolerance when accumulated CI artifacts support it.

Timing is the first blocking metric because hosted-runner heap measurements and filesystem byte counts have different variance and semantics. They remain captured in every raw report. Memory becomes blocking only after repeated CI runs establish a reliable measurement method and tolerance. Raw reports are uploaded for every run so surprising results can be investigated rather than averaged away.

The gate is deliberately change-aware: it runs when core, memory, benchmarks, or their shared configuration changes. Documentation-only and unrelated application changes do not spend benchmark minutes.
