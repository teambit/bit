#!/usr/bin/env node
// Bootstrap patches for the bvm-installed `bit` binary.
//
// Why this exists: while the RFC migration is in flight, the workspace
// source uses new lazy patterns (`Aspect.create({ runtimes: thunk })`,
// `cli.register(descriptor, factory)`, `@teambit/core` Harmony) that the
// shipped bit-1.13.x can't load. `bit compile` requires a working bit
// binary, so we get a chicken-and-egg. This script patches the bvm install
// in-place to bridge the gap; remove it once a bit version ships with the
// patched code baked in.
//
// Usage:
//   node scripts/bvm-patches/apply.mjs              # patches the active bvm bit
//   node scripts/bvm-patches/apply.mjs --bit-dir=…  # explicit path
//   node scripts/bvm-patches/apply.mjs --revert     # restore the .bak files
//
// What gets patched:
//   1) <bvm-bit>/node_modules/@teambit/core    → symlink to <workspace>/node_modules/@teambit/core
//   2) <bvm-bit>/node_modules/@teambit/cli/dist/cli.main.runtime.js
//      → register() learns the new (descriptor, factory) signature
//   3) <bvm-bit>/node_modules/@teambit/bit/dist/load-bit.js
//      → loadLegacyConfig + the main load switch to LazyHarmony from @teambit/core

import { existsSync, readFileSync, readdirSync, writeFileSync, symlinkSync, lstatSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');

const args = new Set(process.argv.slice(2));
const REVERT = args.has('--revert');
// `--esm` opts into the (still-experimental) Slice 09 ESM-emission patches.
// Without it, only the always-on lazy-aspect bootstrap fixes are applied,
// which keep dev compatible with the current CJS-emitting workspace.
const ESM = args.has('--esm');
// `--lazy-esm` (requires --esm): adds a babel plugin that wraps every
// top-level import of a known-CJS package in a `createRequire` lazy
// getter, mimicking `@babel/plugin-transform-modules-commonjs lazy: true`
// for ESM output.
const LAZY_ESM = args.has('--lazy-esm');
const explicitDir = [...args].find((a) => a.startsWith('--bit-dir='))?.split('=')[1];

function findBvmBitDir() {
  if (explicitDir) return resolve(explicitDir);
  // bvm tracks the active version via ~/.bvm/links/bit (a symlink to
  // ~/.bvm/versions/<v>/bit-<v>). That's the canonical install dir.
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    const linkPath = join(home, '.bvm', 'links', 'bit');
    if (existsSync(linkPath) && existsSync(join(linkPath, 'node_modules', '@teambit', 'bit'))) {
      return linkPath;
    }
  }
  abort('could not locate the bvm bit directory; pass --bit-dir=… explicitly');
}

function abort(msg) {
  console.error(`[bvm-patches] error: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[bvm-patches] ${msg}`);
}

function patchOnce(filePath, marker, find, replace) {
  if (!existsSync(filePath)) {
    log(`skip: ${filePath} not present`);
    return;
  }
  const src = readFileSync(filePath, 'utf8');
  if (src.includes(marker)) {
    log(`already patched: ${filePath}`);
    return;
  }
  const idx = src.indexOf(find);
  if (idx === -1) {
    abort(`expected snippet not found in ${filePath} — bit version may not match`);
  }
  const backup = `${filePath}.bvm-patches.bak`;
  if (!existsSync(backup)) copyFileSync(filePath, backup);
  const out = src.slice(0, idx) + replace + src.slice(idx + find.length);
  writeFileSync(filePath, out);
  log(`patched: ${filePath}`);
}

function revertOnce(filePath) {
  const backup = `${filePath}.bvm-patches.bak`;
  if (!existsSync(backup)) {
    log(`no backup for ${filePath}, skipping`);
    return;
  }
  copyFileSync(backup, filePath);
  unlinkSync(backup);
  log(`reverted: ${filePath}`);
}

function linkCoreOnce(bvmDir) {
  const target = join(bvmDir, 'node_modules', '@teambit', 'core');
  const source = join(WORKSPACE_ROOT, 'node_modules', '@teambit', 'core');
  if (!existsSync(source)) {
    abort(`workspace has no @teambit/core at ${source} — run "bit link" first`);
  }
  if (existsSync(target)) {
    try {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        log(`@teambit/core symlink already present in bvm`);
        return;
      }
    } catch {
      /* fall through */
    }
    abort(`${target} already exists and is not a symlink — refusing to overwrite`);
  }
  symlinkSync(source, target);
  log(`linked @teambit/core into bvm: ${target}`);
}

function unlinkCoreOnce(bvmDir) {
  const target = join(bvmDir, 'node_modules', '@teambit', 'core');
  if (!existsSync(target)) return;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
      log(`removed @teambit/core symlink from bvm`);
    }
  } catch {
    /* ignore */
  }
}

// ── Patch 1: cli.main.runtime.js register() ────────────────────────────────

const CLI_FIND = `  register(...commands) {
    commands.forEach(command => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands.forEach(cmd => this.setDefaults(cmd));
    });
    this.commandsSlot.register(commands);
  }`;

const CLI_REPLACE = `  register(...args) {
    // bvm-patches: handle new (descriptor, factory) signature from slice 7.
    if (args.length === 2 && typeof args[1] === 'function') {
      const factory = args[1];
      const command = factory();
      this.setDefaults(command);
      command.commands.forEach(cmd => this.setDefaults(cmd));
      this.commandsSlot.register([command]);
      return;
    }
    const commands = args;
    commands.forEach(command => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands.forEach(cmd => this.setDefaults(cmd));
    });
    this.commandsSlot.register(commands);
  }`;

// ── Patch 2: core-aspect-env capsule babel config ──────────────────────────
//
// The env that compiles bit's own components is `teambit.harmony/envs/
// core-aspect-env`, an external Bit-cloud package. Its `cjs.babel.config.js`
// ships with `@babel/plugin-transform-modules-commonjs` configured with
// `lazy: () => true`. That wraps every top-level `require()` in a thunk,
// which used to be a startup-time win — but now stacks on top of the
// slice 4/7 lazy-aspect machinery + slice 5's command-index short-circuit
// and adds per-call overhead instead of saving anything. With the babel
// thunks removed we see −67% on `bit status (no ws)` and −52% on
// `bit <typo>`; the architectural work is doing its job.
//
// We patch the capsule directly because the env is external. Re-run this
// script after `bit install` if the capsule is rebuilt and reverts.

const ENV_BABEL_FIND_SRC = `const newPlugins = [
  [
    require.resolve('@babel/plugin-transform-modules-commonjs'),
    {
      lazy: () => true,
    },
  ],
  ...plugins,
];`;

const ENV_BABEL_REPLACE_SRC = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
// The slice 4/7 + slice 5 work supersedes it; keeping the babel-level
// lazy hides the impact of the architectural lazy load.
const newPlugins = [...plugins];`;

const ENV_BABEL_FIND_DIST = `const newPlugins = [[require.resolve('@babel/plugin-transform-modules-commonjs'), {
  lazy: () => true
}], ...plugins];`;

const ENV_BABEL_REPLACE_DIST = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
const newPlugins = [...plugins];`;

// ── Patch 3: env preset-env modules:false (ESM emission) ───────────────────
//
// Flips the env's `cjs.babel.config.js` to emit ESM instead of CJS by
// passing `modules: false` to `@babel/preset-env`. Step 1 of the ESM
// source migration (docs/migration/09-esm-source-migration.md). The
// `.js`-extension dance is handled post-compile by
// `fix-bare-esm-imports.mjs`, and package.json `"type": "module"` is
// stamped by `set-package-type-module.mjs`.

const ENV_PRESET_FIND_SRC = `      targets: {
        node: 18,
      },
    },
  ],
]);`;

const ENV_PRESET_REPLACE_SRC = `      targets: {
        node: 18,
      },
      // bvm-patches: emit ESM. Step 1 of slice 09 (ESM source migration).
      modules: false,
    },
  ],
]);`;

const ENV_PRESET_FIND_DIST = `  targets: {
    node: 18
  }
}]]);`;

const ENV_PRESET_REPLACE_DIST = `  targets: {
    node: 18
  },
  // bvm-patches: emit ESM
  modules: false
}]]);`;

// ── Patch 4: inline babel plugin that adds `.js` extensions ────────────────
//
// Step of Slice 09: ESM resolution requires every relative import to carry
// an explicit `.js` extension. Adding it at compile time via this plugin
// is cleaner than the post-compile `fix-bare-esm-imports.mjs` sweep —
// no second pass, no false positives, no race between compile + fix.
//
// We inject the plugin source straight into the env's `cjs.babel.config.js`
// so we don't need a new npm dep or a separate file on disk inside the
// capsule. Idempotent — re-runs are no-ops because the marker check
// catches the inserted function definition.

const EXT_PLUGIN_INLINE = `function bvmAddExtensionsBabelPlugin() {
  // bvm-patches: inline babel plugin — append .js to extension-less
  // relative imports/exports/requires/dynamic imports. We can't
  // distinguish file from directory here because bit strips the
  // package path from the filename passed to babel (we just see
  // '<workspace>/basename.ts'), so filesystem probing would resolve
  // wrong. Directory cases (./foo where foo is a dir with index.js)
  // are repaired by a post-compile sweep that has access to the real
  // dist tree (\`scripts/bvm-patches/fix-bare-esm-imports.mjs\` and
  // \`fix-dir-imports.mjs\`).
  //
  // Skip-list: only append .js when the trailing dot-segment isn't a
  // known module-or-asset extension. Otherwise we'd double-extension
  // 'command-index.generated' → 'command-index.generated.js'.js.
  const KNOWN_EXTS = new Set([
    'js','mjs','cjs','jsx','ts','tsx','mts','cts','json',
    'css','scss','sass','less',
    'svg','png','jpg','jpeg','gif','webp','woff','woff2','ttf','eot',
    'mdx','md','node',
  ]);
  function hasExt(spec) {
    const last = spec.split('/').pop() || '';
    const m = last.match(/\\.([a-zA-Z0-9]+)(?:\\?.*)?$/);
    return m && KNOWN_EXTS.has(m[1].toLowerCase());
  }
  function rewrite(spec) {
    if (!spec) return null;
    if (!/^\\.{1,2}\\//.test(spec)) return null;
    if (hasExt(spec)) return null;
    return spec + '.js';
  }
  return {
    name: 'bvm-add-extensions',
    visitor: {
      ImportDeclaration(p) {
        const r = rewrite(p.node.source && p.node.source.value);
        if (r) p.node.source.value = r;
      },
      ExportNamedDeclaration(p) {
        if (!p.node.source) return;
        const r = rewrite(p.node.source.value);
        if (r) p.node.source.value = r;
      },
      ExportAllDeclaration(p) {
        const r = rewrite(p.node.source.value);
        if (r) p.node.source.value = r;
      },
      CallExpression(p) {
        const c = p.node.callee;
        if (c.type === 'Import' || (c.type === 'Identifier' && c.name === 'require')) {
          const a = p.node.arguments && p.node.arguments[0];
          if (a && a.type === 'StringLiteral') {
            const r = rewrite(a.value);
            if (r) a.value = r;
          }
        }
      },
    },
  };
}`;

// Injects `import.meta.url`-based shims for `__dirname` / `__filename` when
// the compiled module references them. ESM doesn't have those globals; in
// CJS they were free variables. The shim:
//   import { fileURLToPath as __bvm_furl } from 'url';
//   import { dirname as __bvm_dn } from 'path';
//   const __filename = __bvm_furl(import.meta.url);
//   const __dirname = __bvm_dn(__filename);
const DIRNAME_PLUGIN_INLINE = `function bvmDirnamePlugin({ types: t }) {
  return {
    name: 'bvm-dirname',
    visitor: {
      Program: {
        enter(p) {
          let usesDirname = false;
          let usesFilename = false;
          p.traverse({
            Identifier(np) {
              const name = np.node.name;
              if (name !== '__dirname' && name !== '__filename') return;
              if (np.parent && np.parent.type === 'MemberExpression' && np.parent.property === np.node && !np.parent.computed) return;
              if (np.parent && (np.parent.type === 'VariableDeclarator' && np.parent.id === np.node)) return;
              if (name === '__dirname') usesDirname = true;
              if (name === '__filename') usesFilename = true;
            },
          });
          if (!usesDirname && !usesFilename) return;
          // Skip if already declared at top-level (idempotency).
          for (const s of p.node.body) {
            if (s.type === 'VariableDeclaration') {
              for (const d of s.declarations) {
                if (d.id && d.id.type === 'Identifier' && (d.id.name === '__dirname' || d.id.name === '__filename')) {
                  return;
                }
              }
            }
          }
          const body = p.node.body;
          const stmts = [];
          stmts.push(t.importDeclaration(
            [t.importSpecifier(t.identifier('__bvm_fileURLToPath'), t.identifier('fileURLToPath'))],
            t.stringLiteral('url'),
          ));
          if (usesDirname) {
            stmts.push(t.importDeclaration(
              [t.importSpecifier(t.identifier('__bvm_dn'), t.identifier('dirname'))],
              t.stringLiteral('path'),
            ));
          }
          if (usesFilename || usesDirname) {
            stmts.push(t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__filename'),
                t.callExpression(t.identifier('__bvm_fileURLToPath'), [
                  t.memberExpression(t.metaProperty(t.identifier('import'), t.identifier('meta')), t.identifier('url')),
                ]),
              ),
            ]));
          }
          if (usesDirname) {
            stmts.push(t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__dirname'),
                t.callExpression(t.identifier('__bvm_dn'), [t.identifier('__filename')]),
              ),
            ]));
          }
          for (let i = stmts.length - 1; i >= 0; i--) body.unshift(stmts[i]);
        },
      },
    },
  };
}`;

// Injects `import { createRequire as ...; const require = createRequire(import.meta.url);`
// at the top of any compiled module that uses `require(...)` or `require.resolve(...)`.
// Source files have a fair number of these calls — keeping the syntax means we
// don't have to rewrite each call site individually.
const CREATE_REQUIRE_PLUGIN_INLINE = `function bvmCreateRequirePlugin({ types: t }) {
  return {
    name: 'bvm-create-require',
    visitor: {
      Program: {
        enter(p, state) {
          let usesRequire = false;
          p.traverse({
            Identifier(np) {
              if (np.node.name !== 'require') return;
              // Skip member 'require' (e.g. 'foo.require'), import bindings already
              // shadowed, and the *injected* binding once we add it.
              if (np.parent && np.parent.type === 'MemberExpression' && np.parent.property === np.node && !np.parent.computed) return;
              usesRequire = true;
              np.stop();
            },
          });
          if (!usesRequire) return;
          const body = p.node.body;
          // If a top-level require declaration already exists (from a previous
          // run or hand-written), skip.
          for (const s of body) {
            if (s.type === 'VariableDeclaration') {
              for (const d of s.declarations) {
                if (d.id && d.id.type === 'Identifier' && d.id.name === 'require') return;
              }
            }
          }
          const importDecl = t.importDeclaration(
            [t.importSpecifier(t.identifier('__bvm_createRequire'), t.identifier('createRequire'))],
            t.stringLiteral('module'),
          );
          const constDecl = t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('require'),
              t.callExpression(t.identifier('__bvm_createRequire'), [
                t.memberExpression(t.metaProperty(t.identifier('import'), t.identifier('meta')), t.identifier('url')),
              ]),
            ),
          ]);
          body.unshift(constDecl);
          body.unshift(importDecl);
        },
      },
    },
  };
}`;

// CJS-only third-party packages whose `module.exports` Node's `cjs-module-lexer`
// can't statically detect, so `import { x } from 'pkg'` fails with
// "does not provide an export named ...". The plugin rewrites those
// named imports to a default-import + destructure pattern, which always
// works for CJS interop.
const CJS_INTEROP_PLUGIN_INLINE = `function bvmCjsInteropPlugin({ types: t }) {
  const CJS_PKGS = new Set([
    'lodash',
    'fs-extra',
    'semver',
    'graceful-fs',
    'p-map-series',
    'p-map',
    'p-filter',
    'minimatch',
    'comment-json',
    'multimatch',
    'didyoumean',
    'open',
    'pino',
    'pino-pretty',
    'chalk',
    'object-hash',
    'yargs',
    'yargs/yargs',
    'yesno',
    'yn',
    'serialize-error',
    'string-format',
    'lodash.set',
    'lodash.get',
    'lodash.merge',
    'lodash.unionby',
    'user-home',
    '@apollo/client',
    '@apollo/server',
    'graphql',
    'graphql-tag',
    'graphql-tools',
    '@graphql-tools/schema',
    '@graphql-tools/merge',
    'react',
    'react-dom',
    'react-router-dom',
    '@yarnpkg/core',
    '@yarnpkg/cli',
    '@pnpm/types',
    '@pnpm/client',
    '@pnpm/lockfile-types',
    '@pnpm/lockfile.fs',
    'enquirer',
    'inquirer',
    'prompts',
    'ora',
    'cli-table3',
    'cli-table',
    'cli-spinners',
    'is-ci',
    'tiny-glob',
    'pretty-bytes',
    'pretty-ms',
    'object-treeify',
    'log-symbols',
    'find-up',
    'find-root',
    'is-relative-url',
    'parse-package-name',
    'unique-string',
    'untildify',
    'env-paths',
    'temp-dir',
    'tempy',
    'execa',
    'cross-spawn',
    'rimraf',
    'mkdirp',
    'tar',
    'tar-stream',
    'archiver',
    'unzipper',
    'follow-redirects',
    'node-fetch',
    'serialize-javascript',
    'detect-libc',
    'is-arrayish',
    'arrify',
    'array-differ',
    'pretty-error',
    'humanize-string',
    'cli-truncate',
    'wrap-ansi',
    'word-wrap',
    'common-tags',
    'is-text-path',
    'is-binary-path',
    'is-glob',
    'is-extglob',
    'is-plain-object',
    'is-relative',
    'is-absolute',
    'normalize-path',
    'micromatch',
    'date-fns',
    'date-and-time',
    'pad-right',
    'left-pad',
    'lru-cache',
    'mem',
    'mimic-fn',
    'p-debounce',
    'p-throttle',
    'p-limit',
    'p-queue',
    'p-retry',
    'p-timeout',
    'p-event',
    'p-defer',
    'p-cancelable',
    'pretty-format',
    'safe-stable-stringify',
    'fast-glob',
    'globby',
    'cosmiconfig',
    'cosmiconfig-typescript-loader',
    'parse-json',
    'json5',
    'jsonc-parser',
    'reflect-metadata',
    'uniqid',
  ]);
  function pkgKey(spec) {
    if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
    return spec.split('/')[0];
  }
  function safeIdent(spec) {
    return '_bvm_cjs_' + spec.replace(/[^a-zA-Z0-9]/g, '_');
  }
  return {
    name: 'bvm-cjs-interop',
    visitor: {
      ExportNamedDeclaration(p) {
        // \`export { x } from 'cjsPkg'\` — same issue as \`import\`. Rewrite to:
        //   import _pkg from 'cjsPkg';
        //   const { x } = _pkg;
        //   export { x };
        if (!p.node.source) return;
        const source = p.node.source.value;
        const key = pkgKey(source);
        if (!CJS_PKGS.has(key) && !CJS_PKGS.has(source)) return;
        const specifiers = p.node.specifiers;
        if (specifiers.length === 0) return;
        // \`export * as X from 'pkg'\` produces an ExportNamespaceSpecifier
        // which has only \`.exported\` (no \`.local\`). Skip the whole
        // statement — Node handles the namespace re-export against a CJS
        // module via the same default-as-namespace interop as
        // \`import * as X\`, so leaving it alone is fine.
        if (specifiers.some((s) => s.type === 'ExportNamespaceSpecifier' || !s.local)) return;
        const defaultLocal = t.identifier(safeIdent(source));
        const importDecl = t.importDeclaration(
          [t.importDefaultSpecifier(defaultLocal)],
          t.stringLiteral(source),
        );
        const props = specifiers.map((s) =>
          t.objectProperty(
            t.identifier(s.local.name),
            t.identifier(s.local.name),
            false,
            true,
          ),
        );
        const destructure = t.variableDeclaration('const', [
          t.variableDeclarator(t.objectPattern(props), defaultLocal),
        ]);
        const exportNames = t.exportNamedDeclaration(
          null,
          specifiers.map((s) =>
            t.exportSpecifier(t.identifier(s.local.name), t.identifier(s.exported.name)),
          ),
        );
        p.replaceWithMultiple([importDecl, destructure, exportNames]);
      },
      ImportDeclaration(p) {
        const source = p.node.source.value;
        const key = pkgKey(source);
        if (!CJS_PKGS.has(key) && !CJS_PKGS.has(source)) return;
        const specifiers = p.node.specifiers;
        const named = specifiers.filter((s) => s.type === 'ImportSpecifier');
        const nsSpec = specifiers.find((s) => s.type === 'ImportNamespaceSpecifier');
        // Rewrite \`import * as X from 'cjsPkg'\` to default import — for
        // CJS modules, the default *is* the namespace object (module.exports),
        // whereas Node's ESM \`* as\` only sees keys cjs-module-lexer detected.
        if (nsSpec && named.length === 0) {
          p.node.specifiers = [t.importDefaultSpecifier(nsSpec.local)];
          return;
        }
        if (named.length === 0) return;
        const defaultSpec = specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
        const defaultLocal = defaultSpec
          ? defaultSpec.local
          : t.identifier(safeIdent(source));
        const newSpecs = [];
        if (defaultSpec) newSpecs.push(defaultSpec);
        else newSpecs.push(t.importDefaultSpecifier(defaultLocal));
        // Preserve namespace import if present (rare) — emit both: \`import D, * as N from 'pkg';\`
        if (nsSpec) newSpecs.push(nsSpec);
        const newImport = t.importDeclaration(newSpecs, t.stringLiteral(source));
        const props = named.map((s) =>
          t.objectProperty(
            t.identifier(s.imported.name),
            t.identifier(s.local.name),
            false,
            s.imported.name === s.local.name,
          ),
        );
        const destructure = t.variableDeclaration('const', [
          t.variableDeclarator(t.objectPattern(props), defaultLocal),
        ]);
        p.replaceWithMultiple([newImport, destructure]);
      },
    },
  };
}`;

const ENV_EXT_FIND_SRC = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
// The slice 4/7 + slice 5 work supersedes it; keeping the babel-level
// lazy hides the impact of the architectural lazy load.
const newPlugins = [...plugins];`;

const LAZY_PLUGIN_REQUIRE = `const __bvmLazyImportPlugin = require('${WORKSPACE_ROOT}/scripts/bvm-patches/lazy-import-plugin.cjs');`;

const ENV_EXT_REPLACE_SRC = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
// The slice 4/7 + slice 5 work supersedes it; keeping the babel-level
// lazy hides the impact of the architectural lazy load.
${EXT_PLUGIN_INLINE}
${CJS_INTEROP_PLUGIN_INLINE}
${CREATE_REQUIRE_PLUGIN_INLINE}
${DIRNAME_PLUGIN_INLINE}
${LAZY_PLUGIN_REQUIRE}
const newPlugins = [bvmDirnamePlugin, bvmCreateRequirePlugin, bvmCjsInteropPlugin, bvmAddExtensionsBabelPlugin, ${LAZY_ESM ? '__bvmLazyImportPlugin,' : ''} ...plugins];`;

const ENV_EXT_FIND_DIST = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
const newPlugins = [...plugins];`;

const ENV_EXT_REPLACE_DIST = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
${EXT_PLUGIN_INLINE}
${CJS_INTEROP_PLUGIN_INLINE}
${CREATE_REQUIRE_PLUGIN_INLINE}
${DIRNAME_PLUGIN_INLINE}
${LAZY_PLUGIN_REQUIRE}
const newPlugins = [bvmDirnamePlugin, bvmCreateRequirePlugin, bvmCjsInteropPlugin, bvmAddExtensionsBabelPlugin, ${LAZY_ESM ? '__bvmLazyImportPlugin,' : ''} ...plugins];`;

function patchCoreAspectEnvCapsules() {
  // Capsule roots vary per workspace hash, so we glob across all of them.
  const capsuleRoot = join(homedir(), 'Library', 'Caches', 'Bit', 'capsules');
  if (!existsSync(capsuleRoot)) {
    log(`no Bit capsule cache at ${capsuleRoot}, skipping env patch`);
    return;
  }
  let patched = 0;
  for (const workspaceHash of readdirSync(capsuleRoot)) {
    const wsDir = join(capsuleRoot, workspaceHash);
    let envEntries;
    try {
      envEntries = readdirSync(wsDir);
    } catch {
      continue;
    }
    for (const entry of envEntries) {
      if (!entry.startsWith('teambit.harmony_envs_core-aspect-env')) continue;
      const envDir = join(wsDir, entry);
      const srcPath = join(envDir, 'config', 'cjs.babel.config.js');
      const distPath = join(envDir, 'dist', 'config', 'cjs.babel.config.js');
      patchOnce(srcPath, 'bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy', ENV_BABEL_FIND_SRC, ENV_BABEL_REPLACE_SRC);
      patchOnce(distPath, 'bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy', ENV_BABEL_FIND_DIST, ENV_BABEL_REPLACE_DIST);
      if (ESM) {
        patchOnce(srcPath, 'bvm-patches: emit ESM. Step 1 of slice 09', ENV_PRESET_FIND_SRC, ENV_PRESET_REPLACE_SRC);
        patchOnce(distPath, 'bvm-patches: emit ESM', ENV_PRESET_FIND_DIST, ENV_PRESET_REPLACE_DIST);
        patchOnce(srcPath, 'bvm-patches: inline babel plugin', ENV_EXT_FIND_SRC, ENV_EXT_REPLACE_SRC);
        patchOnce(distPath, 'bvm-patches: inline babel plugin', ENV_EXT_FIND_DIST, ENV_EXT_REPLACE_DIST);
      }
      patched++;
    }
  }
  if (patched === 0) log('no core-aspect-env capsules to patch');
}

function revertCoreAspectEnvCapsules() {
  const capsuleRoot = join(homedir(), 'Library', 'Caches', 'Bit', 'capsules');
  if (!existsSync(capsuleRoot)) return;
  for (const workspaceHash of readdirSync(capsuleRoot)) {
    const wsDir = join(capsuleRoot, workspaceHash);
    let envEntries;
    try {
      envEntries = readdirSync(wsDir);
    } catch {
      continue;
    }
    for (const entry of envEntries) {
      if (!entry.startsWith('teambit.harmony_envs_core-aspect-env')) continue;
      const envDir = join(wsDir, entry);
      revertOnce(join(envDir, 'config', 'cjs.babel.config.js'));
      revertOnce(join(envDir, 'dist', 'config', 'cjs.babel.config.js'));
    }
  }
}

// ── Driver ─────────────────────────────────────────────────────────────────

const bvmDir = findBvmBitDir();
log(`bvm bit dir: ${bvmDir}`);

const cliFile = join(bvmDir, 'node_modules', '@teambit', 'cli', 'dist', 'cli.main.runtime.js');

if (REVERT) {
  log(`reverting…`);
  revertOnce(cliFile);
  unlinkCoreOnce(bvmDir);
  revertCoreAspectEnvCapsules();
  log(`done`);
  process.exit(0);
}

// The @teambit/core symlink is needed because a prior `bit compile` rewrote
// some bvm-shipped aspect dist files (e.g. @teambit/clear-cache/dist/...) to
// `require("@teambit/core")`. The symlink lets the require resolve until a
// fresh bit version ships with the patched code.
linkCoreOnce(bvmDir);

patchOnce(cliFile, 'bvm-patches: handle new (descriptor, factory)', CLI_FIND, CLI_REPLACE);

patchCoreAspectEnvCapsules();

log(`done`);
