# Speed lab: measure, reject regressions, then integrate

Status: experiments only. **Production code is unchanged.** Based on `develop` at `578639f`, not the rejected paged-storage branch. No WASM adapter or Map backend is being shipped by this work.

## Findings

| Candidate | Evidence | Decision |
| --- | --- | --- |
| WASM filesystem key hashing | Faster inner loop over pre-packed bytes, slower after packing; no substantial database-level gain repeated in both run orders | Reject this integration |
| Replace the in-memory array with a Map | Much faster point operations, but slower bulk insertion and materialized scans/counts | Reject as a drop-in replacement |
| JS zero/one-ID lookup fast path | Repeated point-read wins, no material slowdown flagged across measured workloads | Candidate for a small production change after review |

These decisions apply to these implementations and workloads—not to WASM or Maps in general. They do not solve filesystem write throughput or complete the previously deferred storage redesign.

### WASM: include conversion costs

The kernel implements the existing filesystem FNV-1a hash over UTF-16 code units, including surrogate pairs and isolated surrogates. WABT 1.0.39 compiles the checked-in WAT; it is a **development-only** dependency. No native compiler is required.

At 10,000 numeric string IDs, median time per batch was:

| Implementation | Time |
| --- | ---: |
| Optimized JS loop over strings | 0.0454 ms |
| JS loop over pre-packed data | 0.0321 ms |
| WASM over pre-packed data, including output copy | 0.0139 ms |
| WASM including packing and output copy | 0.0667 ms |

The kernel-only comparison looks about 2.3× faster than packed JS. The actual string-input comparison is about **47% slower** than optimized JS. At 100,000 IDs the corresponding end-to-end times are 0.533 ms JS and 0.798 ms WASM.

The original public-API storage benchmark was also run with a WASM implementation injected into the filesystem's per-key hashing method. It changes neither page layout nor durability. At 10,000 records the first bulk-insert medians were 711.5 ms baseline and 701.2 ms WASM—a small difference, not a demonstrated material improvement. Across both run orders there were **zero repeated wins** under the screen below and one flagged regression. Do not market this as a faster database.

Cold WASM instantiation and binary size are recorded separately in `hash.json`; WAT compilation is excluded because a deployed implementation would ship a precompiled binary. The warm database operation measurements also exclude WASM startup. Even with that advantage, the integration does not justify itself. Linear-memory high-water usage, browser startup and cross-worker transfer costs have not been profiled here.

### Map: don't choose only the flattering workloads

At 10,000 records, the first unchanged-workload run improves point updates from 0.648 ms to 0.063 ms. But bulk insert rises from 1.065 ms to 1.639 ms (**54% slower**). At 100,000 records, the expanded workload finds additional regressions: count-all increases from roughly 0.00038 ms to 0.135 ms and read-all from 0.00183 ms to 0.134 ms.

The reason is explicit in the prototype: point operations benefit from keyed lookup, while the existing query API expects arrays. Converting Map values back into an array makes previously cheap materialized operations proportional to collection size. These read-all measurements cover returning the result array, not application traversal or cloning of its contents. Eight comparisons flag regressions across the two workload families/run orders. A different hybrid design might avoid them, but that is not proven by this prototype.

### Small JS change: promising without a storage rewrite

The existing in-memory `getRecords()` creates a Set and filters the whole collection even for a single requested ID. The candidate returns immediately for no IDs, uses the existing `getRecord()` for one ID, and retains the original implementation for multiple IDs. It does not add an index, change writes, or alter broad-query handling.

At 10,000 records, the original public-API workload reports:

| Operation | Baseline, runs 1 / 2 | Candidate, runs 1 / 2 |
| --- | ---: | ---: |
| Bulk insert | 1.101 / 1.119 ms | 1.077 / 1.151 ms |
| Point read | 0.202 / 0.241 ms | 0.096 / 0.103 ms |
| Point update | 0.611 / 0.648 ms | 0.520 / 0.524 ms |
| Point delete | 0.505 / 0.551 ms | 0.416 / 0.521 ms |

Point reads improve roughly **52–57%**. Bulk insert is essentially unchanged within this experiment's noise/absolute threshold; it is not accurate to claim every sample is faster. The expanded workload includes filtered reads, full reads, counts, individual inserts and 100,000-record collections. Across both workload families and run orders, the screen finds zero material regressions and ten repeated wins. This supports considering a narrow optimization—not claiming constant-time lookup or solving large-scale storage.

## Method and limits

- Node 24.20.0, Apple M5 arm64, macOS. See `environment.json` for source hashes and process order.
- The original `packages/benchmarks/src/run.ts` and `config.ts` are unchanged. Baseline and candidates run in fresh child processes; a second pass reverses their order. Five samples per size/operation, at 100/1,000/10,000 records.
- Expanded mixed workloads are separately labelled, run seven samples at 100/1,000/10,000/100,000 records, and verify results after each operation. They cannot be directly compared with timings from the original harness.
- CPU component tests use warm-up, rotated candidate order, fifteen samples and repeated batches to improve timing resolution. Numeric string IDs match the current filesystem benchmark workload; Unicode equivalence is tested separately, not performance-profiled.
- A provisional **regression screen** flags an increase exceeding both 10% and 0.05 ms per operation. A repeated win requires at least a 20% reduction and 0.01 ms saved in both run orders. This avoids treating tiny timing fluctuations as material changes, but is not statistical proof or a portable CI threshold. All raw differences remain visible in `comparison.json`.
- Heap deltas are recorded by the storage/mixed harnesses; they are not peak memory. Tiny-operation timings and ratios are noisy. There is no cross-runtime, browser, sustained-load or production-capacity claim.
- The candidate Map intentionally supports unique string-ID documents and does not add snapshot guarantees. It is not a production-complete implementation. The lookup experiment targets the public API's unique-ID contract.

## Evidence retention and decision policy

Keep rejected candidates and their measurements alongside successful ones. This directory retains individual sample timings and available heap deltas, both run orders, aggregate comparisons, machine/runtime metadata, source hashes, and the scripts/prototypes needed to reproduce the findings. The pinned development dependency and lockfile belong to the same evidence commit.

These files are the completed sequential experiment from 2026-09-03. Earlier exploratory runs were overwritten before this archive was created; they cannot be reconstructed from these results. Peak-memory traces and full console logs were not captured. Do not describe this as an archive of every exploratory execution.

Before rerunning, preserve this committed snapshot. The current scripts write to the filenames in this directory: run them in a separate worktree, then retain the complete new output under a distinct dated run directory before committing it. Do not replace earlier evidence with only a new summary or retain only favourable samples. Record the tested revision, any harness changes, validation results, and why a decision changed.

Integration requires correctness checks and repeatable end-to-end improvement without material regressions in other important workloads. A faster isolated kernel alone is insufficient. Revisit rejected designs only with new measurements, and keep the original rejection visible. These experiments do not authorize reduced durability or changed API semantics.

Validation for this snapshot: `yarn validate` passed; the injected lookup prototype passed all 34 existing test suites (336 tests); standalone equivalence checks and lint passed. These are recorded outcomes, not archived console transcripts.

## Reproduction commands

From this worktree, with other heavy jobs stopped:

```sh
yarn install --frozen-lockfile
yarn build
node scripts/speed-lab/run.js
yarn validate
yarn test --runInBand --setupFilesAfterEnv ./scripts/speed-lab/jest-lookup.js
```

The last command injects the exact lookup prototype into the existing TypeScript correctness suite without editing production files. Standalone checks also compare 1,000 seeded adapter mutations, lookup edge cases, and Unicode hash results. Passing those checks is necessary but does not substitute for the performance screen.

Keep this process for subsequent proposals: profile first, test a narrow hypothesis, retain end-to-end baselines, include unfavourable workloads, and do not integrate candidates that merely shift the bottleneck or regress another important operation.
