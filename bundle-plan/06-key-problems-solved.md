# 6. The four problems that actually mattered

[← back to bundle-plan index](../bundle-plan.md)

### 6.1 Mixed resolution of `@teambit/*` → duplicate aspect instances

A workspace component's `package.json` says:

```jsonc
"." :   { "node": { "require": "./dist/index.js", "import": "./dist/esm.mjs" } }
"./*":  "./*.ts"
```

so the **same module** resolves three different ways depending on how it was imported:
`@teambit/cli` from a TS file (an `import`) → `dist/esm.mjs`; from a `require` → `dist/index.js`;
and `@teambit/cli/cli.main.runtime` → the raw **TypeScript source**. A bundler follows all three and
ends up with _two copies of every aspect_ — Harmony would register a runtime on one `CLIAspect`
object and look it up on another.

It also fails outright: `esm.mjs` is a hand-written bridge, and components that never needed one
(`@teambit/validator`, `@teambit/objects`, `@teambit/config-store`, `@teambit/cli-mcp-server`,
`@teambit/empty-env`) simply don't have it. `bit-bundle2`'s answer was to hand-write ~50 `esm.mjs`
files (there is a commit literally titled _"update all esm.mjs files"_).

**Solution** — `teambit-dist-resolver-plugin`: every `@teambit/*` package with `_bit_local: true`
(326 in this repo) resolves to its compiled `dist`, uniformly, bypassing the exports map. Bare
specifier → the package's `main` (**not** hard-coded `dist/index.js` — `@teambit/legacy.constants`
has `main: dist/constants.js`). Deep specifier `@teambit/x/foo` → `dist/foo.js`. Non-workspace
`@teambit/*` packages fall through to esbuild, retried with `require` semantics if the ESM branch
points at a missing file.

### 6.2 `hook-require` was polluting `Object.prototype` — a real bug, not a bundling artefact

`scopes/harmony/bit/hook-require.ts` did:

```ts
module.constructor.prototype.require = function (id) { … }
```

Under a bundler the free `module` variable is the _bundler's_ synthetic module record — a plain
object — so `module.constructor` is **`Object`**, and this installed an enumerable `require` on
`Object.prototype`. Every object in the process then inherited it, and anything doing `for…in`
picked it up. It surfaced as an opaque `hookRequire - id must be a string` from deep inside pino:
lodash's `omit` copies inherited enumerable keys, so a 4-key options object reached the logger with
a fifth key `require` whose value was the hook itself, which pino then called as a serializer.

**Fix**: import the `module` builtin explicitly and patch `Module.prototype.require` / call
`Module._load`. Correct in both bundled and non-bundled builds; `bd --version`, `bd list`,
`bd status` and `npm run lint` all re-verified. **This is worth landing on `master` independently of
bundling.**

### 6.3 ESM consumers need named exports

Envs are ESM: `import { ComponentMap } from '@teambit/component'`. Node can synthesise named exports
from CJS, but only for shapes `cjs-module-lexer` reads statically — and
`module.exports = require(bundle).component` is not one. `bit create` failed with _"Named export
'ComponentMap' not found"_.

**Fix** — `generate-esm-bridges.ts` loads the freshly built bundle **in a child process**, asks it
for the real export names of each aspect namespace, and writes `dist/esm.mjs` accordingly (108
bridges, 0 skipped). Because they are _derived from the artefact_, they cannot drift the way the
hand-written ones in the repo do.

### 6.4 Native code and child processes

- **`@pnpm/napi`** (the pnpm v12 Rust engine) picks a per-platform `.node` package at require time.
- **`jest.worker`** is handed to `jest-worker` as an absolute path and `require`d in a _child_
  process. It is built as its own self-contained bundle at `bundle/workers/jest.worker.js`, and
  `worker-entry-plugin` rewrites the `require.resolve` to point at it. (`require.resolve` in the
  emitted CJS resolves relative to the bundle file, so it travels with the distribution.)
- **`batch`** (via express/serve-index) requires a package called `emitter` that hasn't existed in a
  decade → aliased to node's `events`.
- **`__dirname`-relative data files** (`workspace-template.jsonc`, the AGENTS.md / MCP rules
  templates, typescript's `lib.*.d.ts`) are copied flat into the bundle dir, because inside the
  bundle `__dirname` _is_ the bundle dir. `copy-assets` warns on a name collision rather than
  silently overwriting.
