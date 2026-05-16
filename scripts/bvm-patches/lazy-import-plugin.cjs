// Babel plugin: convert ESM static imports to lazy `createRequire` wrappers.
//
// The CJS side of the workspace gets `@babel/plugin-transform-modules-commonjs
// { lazy: () => true }` which wraps every top-level `require()` in a getter
// that fires on first access. ESM has no native equivalent — `import` is
// static and eager, so every module in the import graph is materialised at
// boot. This plugin mimics babel-lazy for ESM output:
//
//   import { capitalize } from 'lodash';
//   capitalize('hi');
//
// becomes (roughly):
//
//   import { createRequire as __bvm_lazy_createRequire } from 'module';
//   const __bvm_lazy_r = __bvm_lazy_createRequire(import.meta.url);
//   let __bvm_lazy_lodash;
//   function _bvm_lodash() {
//     return __bvm_lazy_lodash || (__bvm_lazy_lodash = __bvm_lazy_r('lodash'));
//   }
//   _bvm_lodash().capitalize('hi');
//
// Constraints / caveats:
//   - Only safe for *CJS* packages (ESM-only packages can't be require()'d
//     synchronously). We use an allowlist + a heuristic that any module
//     specifier already in our `CJS_PKGS` set in apply.mjs is fair game.
//   - Side-effect-only imports (`import 'foo'`) MUST stay eager.
//   - We don't touch `export ... from 'pkg'` re-exports because ESM
//     `export` is structurally static.
//   - Default-import interop matches what babel's `_interopRequireDefault`
//     does (wraps non-`__esModule` modules in `{ default: m }`).

// Default allowlist — same set as the CJS-interop plugin in apply.mjs,
// plus a few obviously-CJS Node-builtins we don't bother lazifying (they're
// cheap and the createRequire shim depends on `module`).
const DEFAULT_CJS_PACKAGES = [
  'lodash', 'fs-extra', 'semver', 'graceful-fs',
  'p-map-series', 'p-map', 'p-filter', 'p-limit', 'p-queue', 'p-retry',
  'p-timeout', 'p-event', 'p-defer', 'p-cancelable', 'p-debounce', 'p-throttle',
  'minimatch', 'multimatch', 'micromatch', 'comment-json',
  'didyoumean', 'open', 'pino', 'pino-pretty', 'chalk', 'object-hash',
  'yargs', 'yargs/yargs', 'yesno', 'yn', 'serialize-error', 'string-format',
  'lodash.set', 'lodash.get', 'lodash.merge', 'lodash.unionby',
  'user-home', '@apollo/client', '@apollo/server',
  'graphql', 'graphql-tag', 'graphql-tools',
  '@graphql-tools/schema', '@graphql-tools/merge',
  'react', 'react-dom', 'react-router-dom',
  '@yarnpkg/core', '@yarnpkg/cli',
  '@pnpm/types', '@pnpm/client', '@pnpm/lockfile-types', '@pnpm/lockfile.fs',
  'enquirer', 'inquirer', 'prompts', 'ora',
  'cli-table3', 'cli-table', 'cli-spinners',
  'is-ci', 'tiny-glob', 'pretty-bytes', 'pretty-ms', 'object-treeify',
  'log-symbols', 'find-up', 'find-root', 'is-relative-url',
  'parse-package-name', 'unique-string', 'untildify', 'env-paths',
  'temp-dir', 'tempy', 'execa', 'cross-spawn',
  'rimraf', 'mkdirp', 'tar', 'tar-stream', 'archiver', 'unzipper',
  'follow-redirects', 'node-fetch', 'serialize-javascript',
  'detect-libc', 'is-arrayish', 'arrify', 'array-differ',
  'pretty-error', 'humanize-string', 'cli-truncate', 'wrap-ansi', 'word-wrap',
  'common-tags', 'is-text-path', 'is-binary-path', 'is-glob', 'is-extglob',
  'is-plain-object', 'is-relative', 'is-absolute', 'normalize-path',
  'date-fns', 'date-and-time', 'pad-right', 'left-pad',
  'lru-cache', 'mem', 'mimic-fn',
  'pretty-format', 'safe-stable-stringify',
  'fast-glob', 'globby',
  'cosmiconfig', 'cosmiconfig-typescript-loader',
  'parse-json', 'json5', 'jsonc-parser',
  'reflect-metadata', 'uniqid',
];

module.exports = function bvmLazyImportPlugin({ types: t }, opts) {
  const list = opts && opts.cjsPackages ? opts.cjsPackages : DEFAULT_CJS_PACKAGES;
  const allowlist = new Set(list);
  // Lazify every `@teambit/*` import too. Node 22.12+ supports
  // `require()` of ESM modules synchronously, so the dist files (which are
  // ESM-shaped after Slice 09) work fine through the createRequire shim.
  // This is the lion's share of the import graph — making it lazy is the
  // closest we get to the CJS-with-babel-lazy behaviour for ESM output.
  const lazifyTeambit = opts && opts.lazifyTeambit !== false;
  function pkgKey(spec) {
    if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
    return spec.split('/')[0];
  }
  function isAllowed(spec) {
    if (allowlist.has(spec)) return true;
    if (allowlist.has(pkgKey(spec))) return true;
    if (lazifyTeambit && spec.startsWith('@teambit/')) return true;
    return false;
  }
  function safeId(spec) {
    return spec.replace(/[^a-zA-Z0-9]/g, '_');
  }
  return {
    name: 'bvm-lazy-import',
    visitor: {
      Program(programPath) {
        const body = programPath.node.body;
        const lazies = []; // { local, kind, imported, source }
        const sources = new Map(); // source -> { cacheId, getterId, hasDefault }
        const removeNodes = new Set();
        for (const node of body) {
          if (node.type !== 'ImportDeclaration') continue;
          if (node.specifiers.length === 0) continue;
          const source = node.source.value;
          if (!isAllowed(source)) continue;
          let entry = sources.get(source);
          if (!entry) {
            const id = safeId(source);
            entry = {
              cacheId: t.identifier('__bvm_lazy_' + id),
              getterId: t.identifier('_bvm_lazy_get_' + id),
              hasDefault: false,
            };
            sources.set(source, entry);
          }
          for (const spec of node.specifiers) {
            if (spec.type === 'ImportDefaultSpecifier') {
              entry.hasDefault = true;
              lazies.push({ local: spec.local.name, kind: 'default', source });
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              lazies.push({ local: spec.local.name, kind: 'ns', source });
            } else if (spec.type === 'ImportSpecifier') {
              lazies.push({
                local: spec.local.name,
                imported: spec.imported.name,
                kind: 'named',
                source,
              });
            }
          }
          removeNodes.add(node);
        }
        if (lazies.length === 0) return;

        // Validate: don't lazify if any locals collide with the scope's
        // already-bound names (e.g. someone shadowed an import name).
        const scope = programPath.scope;
        for (const l of lazies) {
          const binding = scope.getBinding(l.local);
          if (!binding) continue;
          if (binding.kind !== 'module') {
            // Local is not an import binding — skip lazifying to avoid
            // accidentally rewriting unrelated identifiers.
            return;
          }
        }

        // Build the prologue: createRequire shim + cache vars + getters.
        const prologue = [];
        prologue.push(
          t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier('__bvm_lazy_createRequire'),
                t.identifier('createRequire'),
              ),
            ],
            t.stringLiteral('module'),
          ),
        );
        prologue.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier('__bvm_lazy_r'),
              t.callExpression(t.identifier('__bvm_lazy_createRequire'), [
                t.memberExpression(
                  t.metaProperty(t.identifier('import'), t.identifier('meta')),
                  t.identifier('url'),
                ),
              ]),
            ),
          ]),
        );
        // `interopRequireDefault` shim — used when the imported module has
        // a default specifier. CJS `module.exports = X` should yield
        // `{ default: X }` to imports that expect ESM-style default.
        prologue.push(
          t.functionDeclaration(
            t.identifier('__bvm_lazy_interopDefault'),
            [t.identifier('m')],
            t.blockStatement([
              t.returnStatement(
                t.conditionalExpression(
                  t.logicalExpression(
                    '&&',
                    t.identifier('m'),
                    t.memberExpression(t.identifier('m'), t.identifier('__esModule')),
                  ),
                  t.identifier('m'),
                  t.objectExpression([
                    t.objectProperty(t.identifier('default'), t.identifier('m')),
                  ]),
                ),
              ),
            ]),
          ),
        );

        for (const [source, entry] of sources) {
          prologue.push(
            t.variableDeclaration('let', [t.variableDeclarator(entry.cacheId)]),
          );
          // function _bvm_lazy_get_pkg() {
          //   return __bvm_lazy_pkg || (__bvm_lazy_pkg = (hasDefault ? __bvm_lazy_interopDefault : (x => x))(__bvm_lazy_r('pkg')))
          // }
          const requireCall = t.callExpression(t.identifier('__bvm_lazy_r'), [
            t.stringLiteral(source),
          ]);
          const requireWrapped = entry.hasDefault
            ? t.callExpression(t.identifier('__bvm_lazy_interopDefault'), [requireCall])
            : requireCall;
          prologue.push(
            t.functionDeclaration(
              entry.getterId,
              [],
              t.blockStatement([
                t.returnStatement(
                  t.logicalExpression(
                    '||',
                    entry.cacheId,
                    t.assignmentExpression('=', entry.cacheId, requireWrapped),
                  ),
                ),
              ]),
            ),
          );
        }

        // TS type-context node kinds where bare identifier references must
        // stay bare (a `MemberExpression` would be ungrammatical there).
        // Walking up the parent chain catches nested cases like `Foo.Bar`
        // inside `let x: Foo.Bar` (TSQualifiedName → TSTypeReference).
        const TYPE_PARENTS = new Set([
          'TSTypeReference',
          'TSQualifiedName',
          'TSTypeQuery',
          'TSImportType',
          'TSExpressionWithTypeArguments',
          'TSTypeAnnotation',
          'TSTypeParameterInstantiation',
          'TSInterfaceHeritage',
          'TSEnumMember',
          'TSDeclareFunction',
          'TSDeclareMethod',
          'TSModuleBlock',
          'TSModuleDeclaration',
          'TSTypeAliasDeclaration',
          'TSInterfaceDeclaration',
          'JSXMemberExpression',
          'JSXOpeningElement',
          'JSXClosingElement',
        ]);
        function inTypeContext(refPath) {
          let p = refPath.parentPath;
          while (p) {
            if (TYPE_PARENTS.has(p.node.type)) return true;
            // Once we leave declaration-level scopes, the chain is fully
            // value-context — stop walking.
            if (p.node.type === 'BlockStatement' || p.node.type === 'Program' ||
                p.node.type === 'FunctionDeclaration' || p.node.type === 'FunctionExpression' ||
                p.node.type === 'ArrowFunctionExpression' || p.node.type === 'ClassDeclaration' ||
                p.node.type === 'ClassBody') {
              return false;
            }
            p = p.parentPath;
          }
          return false;
        }

        // Rewrite use-sites. For each lazy local, replace every value-level
        // reference with the appropriate accessor expression. Skip references
        // in TS type / JSX-element-name positions where bare identifiers
        // are structurally required.
        for (const l of lazies) {
          const binding = scope.getBinding(l.local);
          if (!binding) continue;
          const entry = sources.get(l.source);
          for (const ref of binding.referencePaths) {
            if (inTypeContext(ref)) continue;
            const replaceWith = (function () {
              const get = t.callExpression(entry.getterId, []);
              if (l.kind === 'ns') return get;
              if (l.kind === 'default') return t.memberExpression(get, t.identifier('default'));
              // named
              return t.memberExpression(get, t.identifier(l.imported));
            })();
            ref.replaceWith(replaceWith);
          }
        }

        // Drop the original import declarations and prepend prologue.
        const newBody = body.filter((n) => !removeNodes.has(n));
        programPath.node.body = [...prologue, ...newBody];
      },
    },
  };
};
