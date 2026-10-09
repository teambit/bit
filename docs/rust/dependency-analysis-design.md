# Dependency extraction: audited baseline and integration design

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

Updated completion: [final work-package checklist](completion-checklist.md) and [final command acceptance](final-command-acceptance.md). This report retains its historical inputs and results; later evidence supersedes its open follow-ups.

Audit revision: `363a3570b894c381d1816e3c87a1af30f6c3ffcf` (2026-10-07).
This inventories current behavior; it does not authorize default enablement or claim command speedup.

## Actual pipeline and extraction boundary

`DependenciesLoader.getDependenciesData()` first checks the persistent component dependency cache. A hit bypasses `AutoDetectDeps`, precinct and all parsing. Workspace-root components also bypass analysis. A miss goes through `AutoDetectDeps.getDependenciesData()` → `build-tree.ts` → `generate-tree-madge.ts` → `dependency-tree/index.ts` → `precinct.paperwork()`; resolution then runs through `filing-cabinet` in TypeScript. Overrides and version/lifecycle classification run afterward.

Precinct synchronously reads UTF-8 source before selecting a detector. Environment detectors win in array order; registered `DetectorHook` detectors win next; built-ins come last. Custom detectors receive source rather than the JS AST dispatch used by built-ins. Keep those hooks authoritative, including for JS/TS files, and leave their execution in TypeScript.

**Current consumer contract is dependency source strings.** `precinct.normalizeDeps()` always converts an object result using `Object.keys()`. Consequently the `dependency-tree._getDependencies()` branches that consume raw `importSpecifiers` and `isScript` are unreachable through the present paperwork interface. `precinct.ast` is deleted before calls and is never assigned by paperwork; the AST passed to cabinet is currently undefined. Preserve this observable behavior when introducing a backend. Compare rich raw detector metadata separately to prevent losing compatibility if that older contract is restored later. Restoring metadata propagation would be a separate behavior change.

## Dispatch and options

| File family                                               | Current selection                                                                      | Initial Rust treatment                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `.ts`, `.tsx`, `.mts`, `.cts`                             | TypeScript detective; `.tsx` mutates `options.ts.jsx = true`                           | Explicit language mode; support only audited options |
| `.js`, `.jsx`, `.cjs`, `.mjs`                             | `node-source-walk` parse followed by `module-definition.fromSource` AST classification | Preserve module classification; AMD stays legacy     |
| `.css`, `.sass`, `.less`, `.scss`, `.styl`, `.md`, `.mdx` | Respective built-ins unless overridden                                                 | Legacy                                               |
| Other extensions                                          | Hooks or empty dependency result                                                       | Legacy                                               |

`includeCore` defaults true in paperwork; dependency-tree forces false and uses Node `module.isBuiltin` to filter sources. Keep built-in filtering in TypeScript for exact Node-version semantics. `useContent` switches JS classification from AST to source but does not eliminate the preceding parse. `options.type` exists in the type declaration, but paperwork initializes `fileInfo.type` to empty and never copies that option: do not infer an implemented forced-language feature. Detectives receive `options[fileInfo.type]`; TS mutates that object with `parser`, `comment=true`, `loc=true`. Do not pass custom parser/options silently to Rust; unknown or unsupported options need an explicit fallback.

JS module classification is a separate compatibility surface from raw ES6 extraction. Empty/unknown classification and AMD behavior need integration tests; directly invoking the ES6 detective on every JS file would widen behavior.

## Installed raw detective behavior

Inspected installed packages: `@teambit/typescript.deps-detectors.detective-typescript@0.0.10`, `@teambit/node.deps-detectors.detective-es6@0.0.6`, and `@teambit/node.deps-detectors.parser-helper@0.0.6`. Installed TypeScript detective declares `@typescript-eslint/typescript-estree ^8.39.0` and `node-source-walk ^6.0.2`; pin actual resolved versions in comparative benchmarks.

Both detectors accumulate dependencies in a JS object, deduplicating sources while retaining specifier arrays in encounter order. `Object.keys` has JavaScript integer-key ordering: numeric-looking sources cannot be treated as ordinary insertion-ordered strings without validation. Empty imports are skipped through truthiness checks. Identifiers named `require` are recognized without lexical binding analysis; shadowed require therefore remains a dependency.

Static imports record `{isDefault, name}`; named aliases use the imported name, default and namespace imports use the local name. Local exports mark the first matching specifier by the exported name, not the local binding; exported aliases are an important legacy edge case. JS re-exports with specifiers record `{isDefault, name, exported:true}`. TypeScript re-exports add the source and `isTypeImport` but no re-export specifiers. TypeScript imports assign `isTypeImport` from declaration `importKind`; repeated declarations overwrite it rather than combining values. Per-specifier `type` does not necessarily make the declaration type-only.

Shared helper behavior:

- `require(value)`, member access on `require(value)`, `require.resolve(value)` and `import.meta.resolve(value)` accept a Literal/StringLiteral or a single-quasi template with no substitution. Templates return their raw rather than cooked value.
- Dynamic import takes truthy literal `.value`; nonliteral expressions and templates are not generally recognized by that branch.
- Member property recognition uses AST `.name`; computed string properties differ from identifier properties. Preserve legacy quirks through fixtures instead of guessing intent.
- TypeScript `TSExternalModuleReference` recognizes import-equals dependencies.

Precinct skips any file whose source starts exactly `// @bit-no-check` or `/* @bit-no-check`. TypeScript detective also suppresses node-associated dependencies if **any parsed comment anywhere** contains `@bit-no-check`, and suppresses a node if the first comment whose start line is the preceding line contains `@bit-ignore`. This is comment start-line behavior, not a generic nearest-comment rule. JS detective has no equivalent per-node ignore check.

TypeScript inspects `@Component({...})` decorators for literal `templateUrl`, `styleUrl` and literal entries of `styleUrls`. It prefixes nonrelative paths with `./`; `/`, `.`, `..`, `./`, `../` count as relative. These Angular additions call `addDependency` without a node and thus bypass the TypeScript comment suppression. Preserve them or fall back for affected syntax.

## Errors, traversal and ordering

Absent entry files return an empty tree. Extraction exceptions, including read failures inside paperwork, are recorded with code `PARSING_ERROR`, and extraction proceeds as an empty dependency list. Cabinet exceptions become `RESOLVE_ERROR` and propagate to generate-tree's per-entry error collector. HTTP/HTTPS source imports are skipped before resolution. Unresolved or nonexistent resolved dependencies populate the missing-data map.

Traversal uses a LIFO stack: extracted dependencies are resolved in source order, then pushed in that order and visited in reverse order. The visited entry stores pathMap, missing imports and parse error. Cache restoration repopulates all three; it uses cached pathMap edges and currently bypasses reapplying the traversal filter. Final madge tree keys and dependency arrays are sorted, while pathMap ordering follows traversal. Do not normalize ordering differences out of the compatibility suite.

`generate-tree-madge` awaits each entry sequentially, excludes paths containing `node_modules` from recursive traversal, and preserves optionally included npm edges separately. A dependency filter participates before files reach the traversal frontier. Do not scan node_modules or unrelated workspace files speculatively.

## Caches and safe batching insertion

`ComponentLoader` owns `cacheResolvedDependencies` (the traversal visited map) and resets it in its existing clear paths. `shouldRunInParallel` uses concurrency one when at least two requested IDs lack persistent cache entries. A native per-file call or microtask batching alone will therefore miss much of the cross-component batching opportunity.

Start with explicit known entry-file batches inside generate-tree, after hook selection and option validation; retain serial resolution and traversal initially. To batch newly discovered files, pre-extract a bounded frontier without mutating visited/pathMap until the existing traversal consumes its result. Such staging must not invoke custom hooks early, add reads of filtered files, or change errors/order. Session identity must be passed explicitly through loader options rather than inferred from process-global state. In-flight deduplication must distinguish logical path, read path, language, normalized options and selected detector; preserve symlink distinctions until equivalence is proven.

Persistent cache validation currently checks component paths/config timestamps and env.jsonc changes; the loader checks node_modules, package.json, pnpm/yarn lockfiles, bitmap and workspace config to invalidate all dependency entries. Keep this storage and invalidation path unchanged. Do not add a persistent native source cache during the prototype. Native results live only for a bounded analysis session and are released at operation completion/cancellation.

Recommended versioned transport: batch protocol version plus stable request IDs, explicit read/logical paths, language and supported options. Return one outcome per request in request order: success, compatibility fallback, read error or parse error. Raw extraction records should retain source, importSpecifiers and optional isTypeImport for differential testing; the current integration adapter consumes only sources. Keep core-module filtering, HTTP skipping, resolution and issue adaptation in TypeScript. Unsupported syntax/options may fallback explicitly; a genuine parse error must not disappear behind unconditional legacy retry. Bound both file count and source bytes, and account for helper memory/CPU if using a process transport.

## Reproducible initial extraction baseline

Run:

```sh
node docs/rust/benchmark-legacy-detector.cjs /path/to/checkout /path/to/checkout-with-node_modules
```

The script selects the first 120 sorted tracked `.ts`/`.tsx` files under scopes/dependencies and scopes/workspace, reads each once per iteration, calls the installed TypeScript detective, warms up once and records nine runs. `legacy-extraction-baseline.json` includes the exact corpus, source bytes, revision, elapsed time, process CPU, dependencies, failures and process peak RSS. This sample deliberately includes realistic repository files but is not a representative workspace command benchmark.

Limitations: sequential raw TypeScript detector only; excludes precinct/hook dispatch, JS module classification, resolution, persistent caches, startup and native transfer. OS cache is warm and Bit dependency cache is not involved. Runs are one variant, not an interleaved Rust comparison; peak RSS includes parser initialization and all iterations. No aggregate async profiler duration is treated as elapsed time. Other agents sharing the host can affect timing.

Full-command cold-cache measurements remain outstanding. The worktree has no compiled `dist`; PATH `bit` reports 2.0.26 while this checkout declares 2.2.93. Installed aspect packages also need to be distinguished from newly compiled checkout code. Running that global CLI against this source checkout cannot establish revision-matched command evidence. Next milestone should build a disposable test workspace with the exact checkout executable, verify analysis actually executes, preserve installed dependencies, and restore equivalent persistent-cache/input state for interleaved warm/cold/single-edit/config-change runs. Do not clear the user's caches to make the experiment convenient.
