# Local development

Install Node.js 22 and Yarn 1.22, then run `yarn install --frozen-lockfile` and `yarn validate`. Root commands cover the entire workspace:

- `yarn typecheck` — TypeScript project-reference validation
- `yarn lint` — shared lint policy
- `yarn test` — package and end-to-end tests
- `yarn build` — dependency-ordered package builds
- `yarn check:boundaries` — package import rules
- `yarn check:packages` — publish-manifest safety checks

## Creating a package

Create `packages/<name>/package.json`, `src/index.ts`, and a `tsconfig.json` extending the root base. Add a root project reference. Publishable packages must define `exports`, `files`, `publishConfig`, `types`, and runtime dependencies. Internal imports must use another package's public name and declare it in `dependencies`. Add package-level tests and extend `tests/integration` when packages interact.

Applications belong in `apps/`; runnable consumer examples belong in `examples/`. Both are private.

## Recording a release change

Run `yarn changeset`, select the affected publishable packages, and describe the user-visible change. Commit the generated `.changeset/*.md` file with the implementation.
