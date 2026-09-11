const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
function blocks(file) {
  return [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
}
function wrap(source) {
  const parsed = ts.createSourceFile('example.ts', source, ts.ScriptTarget.Latest, true);
  const imports = parsed.statements.filter(ts.isImportDeclaration).map((node) => node.getText(parsed));
  const body = parsed.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(parsed));
  return `${imports.join('\n')}\nexport async function example() {\n${body.join('\n')}\n}`;
}
const recipes = blocks('docs/query-recipes.md');
const started = blocks('docs/getting-started.md');
const cases = [
  { name: 'readme', source: blocks('README.md')[0] },
  { name: 'node-start', source: started[0] },
  { name: 'browser-catalogue', source: started.slice(1).join('\n') },
  {
    name: 'queries',
    source: recipes.join('\n'),
    verify:
      'assert.equal(page.totalCount, 2); assert.equal(deleted.deletedCount, 1); assert.equal(await tasks.count(), 2);',
  },
  {
    name: 'retrieval',
    source: blocks('docs/retrieval.md').join('\n'),
    verify:
      "assert.equal(text[0].document.topic, 'storage'); assert.equal(vector[0].document.topic, 'storage'); assert.equal(hybrid[0].document.topic, 'storage');",
  },
  {
    name: 'sync',
    source: blocks('docs/synchronization.md').join('\n'),
    verify: 'assert.equal(first.applied, 1); assert.equal(replay.conflicts, 1);',
  },
  {
    name: 'memory',
    source: blocks('packages/memory/README.md')[0],
    verify: 'assert.equal(backup.memories.length, 1);',
  },
];

async function main() {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
  };
  for (const item of cases) {
    const filename = path.join(root, '.cache', `docs-${item.name}.ts`);
    const source = wrap(item.source);
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, onError, shouldCreate) =>
      file === filename
        ? ts.createSourceFile(file, source, languageVersion, true)
        : original(file, languageVersion, onError, shouldCreate);
    const program = ts.createProgram([filename], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => root,
          getNewLine: () => '\n',
        }),
      );
    if (item.verify) {
      // Evaluate the actual guide snippets with assertions in the same lexical scope.
      const code = ts.transpileModule(wrap(`${item.source}\n${item.verify}`), {
        compilerOptions: { ...options, noEmit: false },
      }).outputText;
      const exports = {};
      // Memory's documented IndexedDB example runs against a real fake-indexeddb implementation.
      require('fake-indexeddb/auto');
      const context = { exports, require, assert, console: { log() {} } };
      vm.runInNewContext(code, context, { filename });
      await exports.example();
    }
    console.log(`Documentation example passed: ${item.name}`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
