# CamaDB 3 release-readiness record

This record maps the [3.0 stable exit gate](https://github.com/elmarti/camadb/issues/127)
to durable repository evidence. It distinguishes implemented controls from
external publication and soak steps that cannot be completed by a source pull
request.

| Exit gate                                                        | State                     | Evidence                                                                                                             |
| ---------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Reproducible benchmark comparisons and justified regression gate | Implemented               | [CI policy](./benchmarks/ci-regression-policy.md), reviewed raw floor, PR #131                                       |
| Improvements advance a reviewed floor without silent slowdown    | Implemented               | Fixed source manifest and base/floor comparisons in PR #131                                                          |
| Cross-runtime behavioral journeys                                | Implemented               | Node/browser-model journeys in PR #129; real Chrome and packed Electron-style consumers in PR #131                   |
| Failure, restart, deletion, compaction and sync replay           | Implemented               | Persistence conformance and integration journeys; offline/interrupted/idempotent replay in PR #126                   |
| Real v2 stores are handled explicitly                            | Implemented               | Published-v2 fixtures and read-only refusal in PR #130; [compatibility policy](./migration-2.x.md)                   |
| Every public package passes clean consumer tests                 | Implemented               | CommonJS, ESM, TypeScript, browser bundle and Electron-style package tests in PR #131                                |
| Exports, dependencies and supported runtimes are documented      | Implemented               | Package archive audit, [API guide](./api.md), and [runtime/workload guide](./supported-workloads.md)                 |
| Security and dependency review                                   | Implemented, time-bounded | Zero-vulnerability production graph and expiring toolchain record in [release audit](./release-audit.md)             |
| Upgrade, recovery and rollback guidance                          | Implemented               | v2 stays on v2; v3 uses a new location; recovery and compaction are documented in [storage](./storage.md)            |
| `3.0.0-rc.N` published and smoke-tested                          | Pending external run      | Manual [release-candidate workflow](./release-candidate.md) publishes committed versions and tests registry packages |
| Agreed soak completes without blockers                           | Pending validation        | Record dates, exact versions and external validation results on issue #127                                           |
| `3.0.0` published and verified                                   | Pending promotion         | Commit `changeset pre exit`, review `develop` to `main`, then verify and merge the generated stable Changesets PR    |

## Scope decision

The v3 release does not promise in-place v2 data compatibility. It detects and
refuses legacy storage without mutation. Existing applications may remain on
v2; applications choosing v3 export through their own v2 application and
import into a new v3 location.

Cama Studio marketplace distribution, durable network synchronization and paid
services are follow-up products. They do not block the embedded database's v3
release unless validation uncovers a violation of an existing public contract.
