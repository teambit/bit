# 18. `mcp-config-writer` — inlined into the bundle instead of copied (2026-08-11)

[← back to bundle-plan index](../bundle-plan.md)

§16c called the three rules templates "structurally required" as a _copied asset_, and noted inlining
as JS strings as a possible-but-unexplored alternative. Tried it on this session; it works and is now
the shipped mechanism — `copy-assets.ts` no longer touches `@teambit/mcp.mcp-config-writer` at all.

### 18a. The change

`getDefaultRulesContent` (`components/mcp/mcp-config-writer/mcp-config-writer.ts:503-530`) now branches
on `process.env.BIT_IS_BUNDLE` — the compile-time constant `run-esbuild.ts` already `define`d but no
component had consumed yet (§8's Startup section names it; grep confirmed zero prior usages anywhere in
the repo):

```ts
if (process.env.BIT_IS_BUNDLE) {
  const bundledTemplates: Record<string, string> = {
    'bit-rules-template.md': require('./bit-rules-template.md'),
    'bit-git-rules-template.md': require('./bit-git-rules-template.md'),
    'bit-rules-consumer-template.md': require('./bit-rules-consumer-template.md'),
  };
  return bundledTemplates[templateName];
}
const templatePath = path.join(__dirname, templateName);
return fs.readFile(templatePath, 'utf8');
```

Two things make this sound in both contexts:

- **Outside the bundle** (the plain published package, compiled by the ordinary `tsc`-based
  component compiler): TypeScript does not module-resolve a bare `require('str')` call the way it does
  `import` — `NodeRequire`'s call signature is `(id: string) => any`, so no `declare module '*.md'`
  ambient type is needed and `tsc --noEmit` stays clean. At runtime `process.env.BIT_IS_BUNDLE` is
  actually unset, so the branch is never entered and the `require('./bit-rules-template.md')` calls
  inside it never execute — avoiding the real failure mode (Node has no loader for `.md`, so an
  unconditional top-level `require` would break every normal install). The disk read below runs
  exactly as before.
- **Inside the bundle**: `run-esbuild.ts`'s `define` (`'process.env.BIT_IS_BUNDLE': '"true"'`) turns the
  condition into a compile-time `if ("true")`; esbuild resolves each literal-string `require(...)` at
  build time (CJS `require` calls with literal specifiers are statically analyzed the same as `import`)
  and, with `.md` now in the `loader` map as `'text'` (`run-esbuild.ts`), inlines the file's raw text as
  a string literal — confirmed in the emitted bundle:
  `require_bit_rules_template = __commonJS({ "...dist/bit-rules-template.md"(exports2, module2) {
module2.exports = "# Bit MCP Agent Instructions\n\n..."; } })`.

### 18b. One real trap: the existing `.md` ignore plugin ate the requires silently

First attempt returned `undefined` for every rules request (`bit mcp-server rules claude-code --print`
printed literally `undefined`, no thrown error). Root cause: `ignoreAssetsPlugin`
(`plugins/ignore-assets-plugin.ts`) already had an `onResolve` filter matching
`/\.(css|scss|sass|less|mdx|md)$/` — added because the main runtime transitively imports UI modules
that pull in stylesheets/mdx docs, which would otherwise fail the build — and it resolves _every_
matching path to `{ contents: 'module.exports = {};', loader: 'js' }` unconditionally, in a
`bit-ignored-asset` namespace that runs before the extension-based `loader` map ever sees the file.
`.md` was in that ignore list too, so the new `require()`s silently became empty objects instead of
either failing loudly or being inlined - `bundledTemplates[templateName]` was `undefined`, not a thrown
error, which is why it fell through the whole call chain as literal text `"undefined"` instead of
crashing anywhere.

Fix: `onResolve` now special-cases the three known filenames and returns `undefined` (the esbuild
plugin-API idiom for "not handled, let the next resolver decide") instead of routing them into the
ignored-asset namespace, so they fall through to normal resolution and the `.md`/`text` loader:

```ts
const KEEP_MD = new Set(['bit-rules-template.md', 'bit-git-rules-template.md', 'bit-rules-consumer-template.md']);
build.onResolve({ filter: IGNORED }, (args) => {
  if (KEEP_MD.has(basename(args.path))) return undefined;
  return { path: args.path, namespace: 'bit-ignored-asset' };
});
```

**General lesson for this bundler**: an existing catch-all resolve/ignore plugin can shadow a new
per-extension `loader` entry entirely, silently and without a build error — esbuild plugin `onResolve`
hooks run before the loader map is consulted for a given path, so "add an extension to `loader`" is not
enough by itself if something else already claims that extension in a plugin. Verify by grepping actual
emitted bundle output for the real content, not just a clean/warning-free build (`npm run bundle`
finished with 0 errors both before and after this fix — the failure was purely a runtime `undefined`,
invisible at build time).

### 18b-2. Single-sourced the filename list after review feedback

First cut hardcoded the three filenames as a literal `Set` inside `ignore-assets-plugin.ts` — a second,
easy-to-forget place to edit if a fourth template is ever added to `mcp-config-writer` (miss it, and the
new file silently falls back to the old ignore-and-empty behavior, reproducing 18b's bug with no error
at build time). Fixed by making the component the single source of truth:

- `mcp-config-writer.ts` now exports `MCP_RULES_TEMPLATE_FILENAMES = [...] as const` and derives a
  `McpRulesTemplateFilename` union type from it; `getDefaultRulesContent`'s `templateName` and the
  `bundledTemplates` record are both typed against that union, so a filename added to the exported list
  without a matching `require(...)` line makes `Record<McpRulesTemplateFilename, string>` fail to
  compile ("Property '...' is missing") instead of shipping a silent gap. The `require()` calls
  themselves still have to stay individually literal — esbuild resolves the `.md` text loader per
  static specifier, so this part can't be turned into a loop over the array.
- `index.ts` re-exports the constant.
- `ignore-assets-plugin.ts` imports `MCP_RULES_TEMPLATE_FILENAMES` from `@teambit/mcp.mcp-config-writer`
  instead of hand-copying the list, and builds `KEEP_MD` from it.

This adds a real dependency edge (`modules/cli-bundler` → `@teambit/mcp.mcp-config-writer`) that didn't
exist before (previously `copy-assets.ts` only referenced the package by string for path resolution,
never imported it). Bit's dependency resolver picked it up automatically — `bit deps get
modules/cli-bundler` lists it as a `prod` dependency with no manual `bit deps set` needed, and `bit
status -w` raised no missing-dependency warning for either component. Re-verified after the refactor:
`npm run lint` clean, full rebuild + reinstall, and the same end-to-end `bit mcp-server rules
claude-code --print` check against the rebuilt bundle still byte-identical to the source template.

### 18c. Verification

- `bit compile mcp-config-writer` + `bit compile modules/cli-bundler`, then `npm run bundle` — 0
  errors, 0 change in warning count (68, all pre-existing `require-resolve-not-external` webpack/rspack
  config-builder warnings, see §10).
- `grep` the emitted `bit.app.js`: all three templates present as full string literals under
  `require_bit_rules_template` / `require_bit_git_rules_template` / `require_bit_rules_consumer_template`,
  each keyed to its real `dist/<name>.md` source path in the generated module id.
- **No loose `bit-*-template.md` files land in the bundle dir anymore** — confirmed via `find
dist/core-aspects/bundle -maxdepth 1 -iname "*template*"`, which now shows only
  `agents-template*.md`/`workspace-template.jsonc` (host-initializer's and config's own assets, both
  untouched by this change) and none of the three mcp ones.
- End-to-end against the rebuilt, `npm install`'d bundle in `/tmp/bit-bundle`, run from
  `/tmp/bundle-tests/*` scratch workspaces (real CLI invocation, not just static inspection):
  - `bit mcp-server rules claude-code --print` in a non-git workspace → byte-identical to
    `bit-rules-template.md` (mod. trailing newline from the CLI's own `console.log`).
  - Same command inside a `git init`'d workspace → byte-identical to `bit-git-rules-template.md`.
  - `--consumer-project` → byte-identical to `bit-rules-consumer-template.md`.
  - `bit mcp-server rules claude-code` (no `--print`, writes `.claude/bit.md`) → identical to
    `bit-rules-template.md` once `writeRulesFile`'s own pre-existing header comment (unrelated to this
    change) is stripped.
- `npm run lint` (`tsc --noEmit` + `oxlint`): 0 errors, 0 warnings, repo-wide.

### 18d. Status and what's now stale elsewhere in this doc

**Done.** `copy-assets.ts`'s `ASSETS` array no longer has an entry for
`@teambit/mcp.mcp-config-writer`; §16c's "possible alternative, not implemented" is now the shipped
mechanism, and its "same undeclared-dependency issue as §16a" note about `bit deps set` needing to cover
`@teambit/mcp.mcp-config-writer` is now moot — the package's JS is bundled as before (it was never
external), and nothing about it needs declaring as an external dependency anymore since there is no
longer a copied asset relying on the published package's version being resolvable. §11C's "Still open"
bullet listing `@teambit/mcp.mcp-config-writer` alongside the 4 undeclared externals should be read with
that in mind next time someone works the packaging checklist.

This is also a reusable pattern for the other `copy-assets.ts` entries that exist only because a
component reads a file via `path.join(__dirname, …)`: `@teambit/config`'s `workspace-template.jsonc`
and `@teambit/host-initializer`'s `agents-template*.md` are structurally the same shape (single static
file, read whole, returned as a string) and could take the identical `BIT_IS_BUNDLE` + `require()` +
text-loader treatment if their copy-assets entries are ever worth removing too - not done here, scope
was mcp-config-writer only.
