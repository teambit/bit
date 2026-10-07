---
name: e2e-to-unit
description: Convert an e2e test file (e2e/**/*.e2e.ts) into unit tests (.spec.ts) inside the aspect that owns the logic. Use when asked to convert, migrate or replace e2e tests with unit tests, or to cut e2e CI time.
---

# Converting an e2e file to unit tests

E2e tests spawn a `bit` process per command and dominate CI cost. Most of them only need one in-process
harmony load. Convert every test you can; leave in the e2e file only what truly cannot run in-process.

## The pattern

```ts
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents, modifyMockedComponents } from '@teambit/component.testing.mock-components';

const workspaceData = mockWorkspace(); // temp workspace + a local bare scope as the remote (remoteScopeName/Path)
const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspaceData.workspacePath);
const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
await snapping.tag({ build: false, version: '0.0.1' });
// ...
await destroyWorkspace(workspaceData); // in after()
```

- **Load fresh harmony to simulate a new process.** A later command in an e2e flow often depends on nothing
  being cached in memory. Call `loadManyAspects` again for each "process".
- **Call the aspect API, or the command class directly** when the test asserts CLI output or flag
  validation: `new AddCmd(tracker).report([paths], flags)`, or the registered instance via
  `harmony.get<CLIMain>(CLIAspect.id).getCommand('cat')`. Strip colors with `strip-ansi` before matching text.
- **Commands resolve relative paths against `process.cwd()`.** `process.chdir(workspacePath)` inside
  try/finally, and restore it.
- **`.bitmap` starts with a comment banner.** Read it with `parse` from `comment-json`, not `readJson`.
- **Errors:** chai has no async throw matcher. Use a small `expectToReject(fn, messagePart)` helper. To compare
  with a specific error class, match `stripAnsi(new TheError(...).message)`.
- **Remote flows (export/import/lanes)** are usually still in-process: `mockWorkspace()` gives a bare remote
  scope, `mockBareScope()` gives more, and `ExportAspect`/`ImportAspect`/`LanesAspect` load like any other.
  See `scopes/component/snapping/snapping.spec.ts` and `scopes/lanes/lanes/lanes.spec.ts`.
- **Look for helpers in existing specs** of the target aspect and reuse them (e.g.
  `scopes/component/tracker/add-cmd.spec.ts`, `scopes/component/checkout/checkout.spec.ts`).
- Pure logic (formatting, parsing, validation) needs no workspace: build the class with fakes
  (see `scopes/component/component/cat/cat.cmd.spec.ts`).

## Where the spec goes, and dependency cycles

Put the spec next to the code that owns the behaviour. Name it after what it tests (`add-cmd.spec.ts`), and
add a `describe` to an existing spec file when one already covers the area.

**A spec's imports are dev dependencies, and they count in the component graph.** Never import, in a spec of
component C, an aspect that (transitively) depends on C. For example, the component aspect must not import
workspace/snapping. When the test needs a higher aspect, split it:

- formatting/validation goes next to the code, with fakes;
- the real flow goes in the lowest aspect that already depends on everything it needs (e.g. the `bit cat`
  version tests live in snapping).

Prefer helpers the target already depends on (e.g. `mockComponents` instead of importing tracker).

Hosts that worked well, since they already depend on most of what these flows need:

- `scopes/component/snapping`: tag/snap/export/import/merge flows (it can't import status, merging, checkout,
  deprecation or pnpm without a cycle);
- `scopes/component/status`: flows that assert `bit status` (it depends on snapping, remove and lanes);
- `scopes/component/checkout`, `scopes/component/deprecation`: for tests that need those aspects on top of
  snapping.

Check before reporting with the repo's own CI check (CircleCI job `check_circular_dependencies`):
`BIT_BIN=bit2 node scripts/circular-deps-check/check-cycles.js`. It fails when a component joins a cycle **and**
when a spec adds a new dependency between two components that are already in the same cycle (e.g.
snapping→tracker), so either one breaks CI. Fix it by moving the test (see the hosts above) or by using a helper
the component already depends on. Don't update `cycles-baseline.json` to make a spec pass.

## In-process gotchas (each cost a worker time in batch 1)

- **Static caches survive a fresh `loadManyAspects`:** `Scope.scopeCache` and the object cache
  (`scope.legacyScope.objects.clearObjectsFromCache()`). Reset them when the e2e relied on a new process.
- **Remotes in `.bit/scope.json` are read once per process.** Add every remote scope before the first harmony
  load.
- **Env components get imported into the local scope,** which inflates `list --local-scope` counts and the
  index.json entries. Filter by the workspace/remote scope name.
- **`~/.bitrc.jsonc` can replace an aspect's config** (seen with dependency-resolver), so a policy written to
  `workspace.jsonc` gets silently ignored. Set it on the loaded aspect's config. Never touch the global file.
- **`bit delete --hard`** needs `addFeature('hard-delete')` in `before` and `reloadFeatureToggle()` in `after`.
- **`import` with skipped installation leaves components "modified";** call `install.link()` after it. The
  importer rejects a bare `*`, so use `<remote>/*`.
- **Global remotes:** swap `GlobalRemotes.load` for an in-memory version and restore it in `after` (see
  `scopes/harmony/global-config/remote-cmd.spec.ts`).
- **Soft tag in-process** needs `releaseType: 'patch'`, which the CLI defaults to.

## What may stay e2e

Only tests that cannot run in one process: real `bit watch`/`bit start` servers, CLI-framework behaviour
(yargs parsing, exit codes, process-level `--json` printing), git hooks run by git, bvm, or anything that
spawns a separate process by design, or a real package install from the registry (e.g. installing a real env's
peers). Keep them in the e2e file and trim the rest. Delete the e2e file once
nothing is left. "It's a long flow" and "it uses a remote" are not reasons to keep a test e2e.

## Keep coverage honest

- Keep every assertion of the original. Don't weaken it just to make it pass. If an old assertion turns out
  to be wrong, keep the test and say so in the report.
- One `describe` per original scenario, with readable names. Keep the fixtures as small as the original's.
- Don't change production code. If a test exposes a bug, report it instead of fixing it.

## Verify

1. `bit2 test <path/to/new.spec.ts> [...]`: pass spec **paths**, so only your files run. (Use the binary that
   matches the repo dir: bit2, bit3, ...)
2. `npm run lint`: fix errors in your own files. Others may be editing other files in parallel; ignore their errors.
3. `bit2 status`: no component issues (missing packages etc.) on the components you touched.
4. Delete the e2e file (`git rm`), or trim it if some tests remain. The orchestrator updates
   `scripts/e2e-test-timings.json`.

## Running a batch (orchestrator)

`worker-prompt.md` here is the per-file brief: one fresh Sonnet agent per file, about 6 in parallel in the same
working tree, with `__FILE__` replaced. At the end of the batch: remove deleted files from
`scripts/e2e-test-timings.json`, run `npm run lint`, run prettier on the new specs, run `check-cycles.js`, and run
all new specs together in one `bit test` run (that catches shared-state interference between specs).
