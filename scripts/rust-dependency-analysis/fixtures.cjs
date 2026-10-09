// Sources deliberately remain inline: invalid syntax and unsupported modes are test inputs.
module.exports = [
  { name: 'empty', path: 'empty.js', source: '' },
  { name: 'imports', path: 'imports.js', source: `import main, { original as local } from 'pkg'; import * as ns from './ns'; import './side'; export { local }; export default main;` },
  { name: 'reexports-js', path: 'exports.mjs', source: `export { default as renamed, value as alias } from './one'; export * from './two';` },
  { name: 'calls', path: 'calls.cjs', source: `const a = require('pkg'); require.resolve('./resolved'); import('./dynamic'); require(variable); import(variable);` },
  { name: 'unclassified-js', path: 'resolve-only.js', source: `const target = require.resolve('./resolved');` },
  { name: 'optional-call-js', path: 'optional.js', source: `import './base'; require?.('./optional');` },
  { name: 'optional-call-ts', path: 'optional.ts', source: `import './base'; require?.('./optional');` },
  { name: 'computed-import-meta', path: 'computed.js', source: `import './base'; import.meta[resolve]('./computed');` },
  { name: 'string-import-name', path: 'strings.js', source: `import { 'some-name' as named } from 'pkg';` },
  { name: 'string-import-name-ts', path: 'strings.ts', source: `import { 'some-name' as named } from 'pkg';` },
  { name: 'string-export-name', path: 'strings-export.js', source: `import './base'; export { 'str-name' as 'other-name' } from './export';` },
  { name: 'first-module-node', path: 'mixed.js', source: `require('pkg'); define(['amd'], function() {});`, expectFallback: 'AMD call requires conservative fallback even after CommonJS classification' },
  { name: 'numeric-call-esm', path: 'numeric.js', source: `import './base'; require(123); require(true);` },
  { name: 'numeric-call-ts', path: 'numeric.ts', source: `require(123); require(true);`, expectFallback: 'Legacy TS coerces nonstring literals into dependency keys' },
  { name: 'parenthesized-require', path: 'parens.js', source: `import './base'; (require)('./p'); (require.resolve)(('./q'));` },
  { name: 'parenthesized-require-ts', path: 'parens.ts', source: `(require)('./p');` },
  { name: 'optional-member-js', path: 'optional-member.js', source: `import './base'; require?.resolve('./skipped'); require('./kept')?.value;` },
  { name: 'optional-member-ts', path: 'optional-member.ts', source: `require?.resolve('./kept');` },
  { name: 'optional-call-classification', path: 'optional-only.js', source: `require?.('./optional'); require.resolve('./unclassified');` },
  { name: 'nonstring-import', path: 'nonstring-import.js', source: `import './base'; import(5);`, expectFallback: 'Legacy coerces nonstring dynamic import sources into dependency keys' },
  { name: 'regexp-call-ts', path: 'regexp.ts', source: `require(/pattern/);`, expectFallback: 'Legacy TS coerces regex literals into dependency keys' },
  { name: 'integer-like-key', path: 'integer.js', source: `import './base'; require('123');`, expectFallback: 'JS objects enumerate integer-like legacy keys first' },
  { name: 'duplicates', path: 'duplicates.js', source: `import { a } from 'pkg'; import { b } from 'pkg'; require('pkg');` },
  { name: 'comments-strings', path: 'comments.js', source: `// require('fake')\nconst text = "import x from 'fake'"; import './real';` },
  { name: 'dynamic-import-only', path: 'lazy.js', source: `const Page = () => import('./page');` },
  { name: 'jsx-in-js', path: 'component.js', source: `import React from 'react'; export const View = () => <div />;` },
  { name: 'jsx', path: 'view.jsx', source: `import React from 'react'; import View from './view'; const x = <View />;` },
  { name: 'typescript', path: 'types.ts', source: `import type { A as B } from 'types'; import { C } from './runtime'; export type { D } from './exported'; import E = require('./external');` },
  { name: 'tsx', path: 'view.tsx', source: `import View from './view'; const x: JSX.Element = <View />;` },
  { name: 'mts', path: 'module.mts', source: `import type { A } from './a'; export * from './b';` },
  { name: 'cts', path: 'module.cts', source: `import x = require('./a');` },
  { name: 'type-overwrite', path: 'duplicates.ts', source: `import type { A } from 'pkg'; import { B } from 'pkg';` },
  { name: 'ignore-line', path: 'ignore.ts', source: `// @bit-ignore\nimport x from './ignored';\nimport y from './included';` },
  { name: 'no-check-ts', path: 'skip.ts', source: `import x from './first';\n// @bit-no-check\nimport y from './second';` },
  { name: 'no-check-js', path: 'skip.js', source: `// @bit-no-check\nimport x from './ignored';` },
  { name: 'no-check-invalid-js', path: 'skip-invalid.js', source: `/* @bit-no-check */\nconst = invalid;` },
  { name: 'escaped-specifier', path: 'escaped.js', source: `import './\\u0061'; require('./\\u0062');` },
  { name: 'literal-templates', path: 'templates.ts', source: 'require(`./template`); import(`./dynamic`); require(`./${variable}`);' },
  { name: 'core-filter', path: 'core.js', source: `import fs from 'fs'; import path from 'node:path'; import x from 'pkg';`, options: { includeCore: false }, expectFallback: 'Nonempty options retain legacy filtering' },
  { name: 'angular', path: 'angular.ts', source: `@Component({ templateUrl: 'view.html', styleUrl: './view.css', styleUrls: ['one.css', '../two.css'] }) class View {}`, expectFallback: 'Decorator asset extraction retains the legacy detector' },
  { name: 'invalid-js', path: 'invalid.js', source: `import { from 'pkg';`, expectFallback: 'JS parse failures defer to Babel, which accepts Flow and proposal syntax' },
  { name: 'flow', path: 'flow.js', source: `// @flow\nimport type { T } from './t'; const n: number = 1;`, expectFallback: 'Flow syntax is parsed only by the legacy Babel walker' },
  { name: 'invalid-ts', path: 'invalid.ts', source: `const value: = 1;` },
  { name: 'amd', path: 'amd.js', source: `define(['pkg'], function(pkg) {});`, fallback: 'AMD dispatch remains on the legacy detector' },
  { name: 'custom-detector', path: 'custom.js', source: `import x from 'pkg';`, options: { customDetector: true }, fallback: 'Environment and global detectors take precedence' },
  { name: 'unsupported-css', path: 'style.css', source: `@import './other.css';`, fallback: 'Non-JS/TS detectors remain on the legacy path' },
];

// Existing precinct fixtures mostly disable extraction with a leading no-check.
// Test their real sources plus an explicitly named variant with that directive removed.
const fs = require('node:fs');
const path = require('node:path');
const precinctDirectory = path.resolve(__dirname, '../../scopes/dependencies/dependencies/files-dependency-builder/fixtures/precinct');
const classificationFallback = new Set(['Gruntfile.js', 'amd.js', 'cjsExportLazy.js', 'exampleAST.js']);
for (const filename of fs.readdirSync(precinctDirectory).filter((filename) => filename.endsWith('.js')).sort()) {
  const source = fs.readFileSync(path.join(precinctDirectory, filename), 'utf8');
  module.exports.push({ name: `precinct-original-${filename}`, path: filename, source,
    ...(classificationFallback.has(filename) && !source.startsWith('// @bit-no-check') ? { expectFallback: 'Assignment-based or AMD classification retains legacy dispatch' } : {}),
  });
  if (source.startsWith('// @bit-no-check')) {
    module.exports.push({ name: `precinct-enabled-${filename}`, path: filename, source: source.replace(/^\/\/ @bit-no-check\r?\n/, ''),
      ...(classificationFallback.has(filename) ? { expectFallback: 'Assignment-based or AMD classification retains legacy dispatch' } : {}),
    });
  }
}

// These names interact with the detectives' ordinary-object maps. Preserve the
// legacy omissions/errors through explicit fallback rather than fixing them in
// only one backend. Include every inherited Object.prototype property.
for (const specifier of Object.getOwnPropertyNames(Object.prototype)) {
  for (const ext of ['js', 'ts']) {
    for (const [mode, source] of [
      ['import', `import { value } from '${specifier}'; export { value };`],
      ['require', `require('${specifier}');`],
      ['dynamic', `import('${specifier}');`],
      ['reexport', `export { value } from '${specifier}';`],
    ]) {
      module.exports.push({
        name: `prototype-${specifier}-${mode}-${ext}`,
        path: `prototype-${mode}.${ext}`,
        source,
        expectFallback: 'Legacy ordinary-object dependency maps have prototype-sensitive omissions/errors',
      });
    }
  }
}
for (const name of ['constructor', '__proto__', 'toString']) {
  for (const ext of ['js', 'ts']) {
    module.exports.push({
      name: `prototype-binding-${name}-${ext}`,
      path: `prototype-binding.${ext}`,
      source: `import { ${name} } from 'pkg'; export { ${name} };`,
    });
  }
}
