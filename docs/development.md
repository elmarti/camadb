# Local development

Install Node.js 22 or newer and Yarn 1.22, then run `yarn install --frozen-lockfile` and `yarn validate`. CI tests every supported Node.js release line (22, 24, and 26). Root commands cover the entire workspace:

- `yarn typecheck` — TypeScript project-reference validation
- `yarn lint` — shared lint policy
- `yarn test` — package and end-to-end tests
- `yarn build` — dependency-ordered package builds
- `yarn check:boundaries` — package import rules
- `yarn check:packages` — publish-manifest safety checks
- `yarn benchmark:storage` — reproducible storage baseline (use `--sizes`, `--iterations`, and `--output` to override defaults)
- `yarn benchmark:memory` — provider-independent memory ingest and recall baseline

## Creating a package

Create `packages/<name>/package.json`, `src/index.ts`, and a `tsconfig.json` extending the root base. Add a root project reference. Publishable packages must define `exports`, `files`, `publishConfig`, `types`, and runtime dependencies. Internal imports must use another package's public name and declare it in `dependencies`. Add package-level tests and extend `tests/integration` when packages interact.

Applications belong in `apps/`; runnable consumer examples belong in `examples/`. Both are private.

## Storage benchmarks

Run the benchmark on an otherwise idle machine with Node.js 22 or newer:

```sh
yarn benchmark:storage --sizes 100,1000,10000 --iterations 5 --output benchmark.json
```

The harness runs identical bulk-insert, point-read, point-update, and point-delete workloads against filesystem and in-memory adapters. Point reads use a seeded collection instance so the workloads remain comparable across durable and non-durable adapters; hydration cost is captured by insertion and its heap delta. It reports every sample plus medians for elapsed time, heap change, and filesystem collection bytes, together with runtime and hardware metadata. Use the same command and committed harness before and after storage changes; do not compare results produced with different dataset sizes or iteration counts. Heap deltas require the included `--expose-gc` invocation and remain process-level observations rather than exact retained-object sizes.

Use the equivalent memory workload when changing `@camadb/memory` or its retrieval path:

```sh
yarn benchmark:memory --sizes 100,1000,10000 --iterations 5 --output memory.json
```

The harness uses deterministic caller-produced 32-dimensional vectors so it measures CamaDB rather than a model or network provider. It retains all samples and reports batch remember, point inspect, text recall, vector recall, and hybrid recall. Compare future changes against the same committed workload; new providers require a separate benchmark because their startup and inference costs are outside this baseline.

## Recording a release change

Run `yarn changeset`, select the affected publishable packages, and describe the user-visible change. Commit the generated `.changeset/*.md` file with the implementation.
