# Writing and publishing documentation

## One build, two kinds of documentation

The Next.js website supplies the public landing page and local demo. TypeDoc builds `/docs/` from public core, memory and sync entry points plus the Markdown guides in this repository. It derives signatures and JSDoc from TypeScript; it does not maintain a separate hand-written API listing.

```sh
yarn docs:check  # validate examples, public callable documentation and guide links
yarn docs:build  # write apps/website/out/docs
yarn build      # build the complete website, docs and offline demo
```

For the GitHub Pages path, use `CAMADB_BASE_PATH=/camadb yarn build`. Generated docs use relative URLs. Preview with `yarn workspace @camadb/website dev` after building the knowledge demo; that command also generates docs in the website public directory. Restart it after changing API comments or guide content.

## Public API comments

Document every exported function, public constructor/method/accessor, and callable interface member using `/** ... */` JSDoc. Describe the observable behavior, return semantics, important bounds and destructive effects. Use `@param`, `@returns`, `@throws`, and fenced `@example` blocks where they clarify a contract. Comments should explain more than the method name. Keep implementation helpers private rather than advertising them as supported APIs.

`typedoc.json` enables undocumented-callable and invalid-link validation as build failures. The website build runs that validation, including in CI. `scripts/check-doc-examples.js` typechecks the README and selected complete guide examples and executes the query, retrieval, memory and sync recipes. `scripts/check-doc-links.js` checks generated pages, fragments, assets and README website destinations. Documentation-only changes select the website in affected-workspace CI. Shared contracts can use `{@inheritDoc Interface.method}` when implementation and interface behavior agree.

## Guides and examples

Add Markdown under `docs/` and link it from `start.md`. Package READMEs for core, memory and sync are also deployed. Use relative Markdown links between source guides; TypeDoc resolves them to generated pages. Prefer complete examples with imports, setup, a declared runtime and expected results. Clearly label snippets that depend on preceding setup and synthetic vectors that are not real embeddings.

Never silently change a guide to describe an unreleased stable version. Keep install channels, migration rules and workload limits explicit. Test examples against the current types. Do not use `destroy()` in teardown examples without identifying that it deletes persisted data.

## Deployment

`.github/workflows/deploy-docs.yaml` builds the website, demo and TypeDoc output as one Pages artifact on relevant `main` changes or a manual run. Source comments, sync changes, guides, lockfile and documentation configuration all trigger it. A branch build validates documentation locally; it does not publish the website. Stable website publication follows the repository's merge/release process.
