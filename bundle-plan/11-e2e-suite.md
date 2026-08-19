# 9c. Running the e2e suite against the bundle

[← back to bundle-plan index](../bundle-plan.md)

```bash
npm run e2e-test:bundle                          # whole suite against bundle/bit.app.js
npm run e2e-test:sea                             # whole suite against the SEA binary
npm run e2e-test:bundle -- ./e2e/commands/cat.e2e.ts     # a single spec
npm run e2e-test:bundle -- --force                       # rebuild even if it looks current
npm run e2e-test:bundle -- --no-build                    # fail instead of building (assert CI prepared it)
npm run e2e-test:bundle-circle                           # CircleCI reporter flags
npm run e2e-test:sea-circle
npm run bundle:ensure                            # just the build-if-stale step, no tests
```

`scripts/e2e-with-bundle.js` prepares the artefact, then runs the normal mocha command with
`npm_config_bit_bin` pointed at it — which `CommandHelper.getBitBin()` already honours, and which
accepts a full command (`node /tmp/bit-bundle/node_modules/@teambit/bit/bin/bit`), not just a bin
name. Unrecognised arguments are forwarded to mocha, so `.only` workflows and explicit spec paths
work unchanged.

### Build-once-per-machine, without ever testing a stale bundle

CI splits the suite across many fresh machines and invokes mocha repeatedly on each; a rebuild per
invocation would dominate the run. Locally the opposite risk applies: a `/tmp/bit-bundle` from
yesterday silently tests the wrong code.

Both are served by one rule — **build if and only if the stamp doesn't match**
(`scopes/harmony/bit/bundle/ensure-bundle.ts`). The stamp, written to `<out-dir>/bundle-stamp.json`,
records:

| input                                                                              | catches                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `distFingerprint` — count + newest mtime across every workspace component's `dist` | any `bit compile`, i.e. any source change                      |
| `bundlerFingerprint` — mtimes of the compiled bundler                              | changes to the bundler itself                                  |
| `externalsHash`                                                                    | a changed externals list (→ the externals must be reinstalled) |
| `bitVersion`, `node`, `platform`, `arch`                                           | wrong machine / wrong runtime                                  |
| `sea`, `uiBundling`                                                                | a different artefact was requested                             |

Consequences, all verified:

- **CI:** first invocation on a machine builds (`no previous build`); every later invocation on the
  same machine reuses it, because nothing in the stamp moved. No cross-machine cache needed.
- **Local:** recompiling anything moves `distFingerprint` and triggers exactly one rebuild.
- A `--sea` request against a script-only build rebuilds (`artifact missing`); a plain request against
  a `--sea` build **reuses** it, since the SEA build produces the script bundle too.
- `--force` always rebuilds; `--no-build` turns staleness into a hard error, which is what a CI job
  should use if a separate step is supposed to have prepared the bundle.

The externals `npm install` runs as part of the ensure step and is a no-op on a warm machine, because
a clean rebuild deliberately preserves `bundle/node_modules`.

### The UI-bundling sanity suites (`ui-ssr.e2e.ts`, `ui-start.e2e.ts`) — two modes, both opt-in (2026-08-19)

These two files (cherry-picked from upstream #10628/#10629/#10631, see §14 2026-08-19) start a real
`bit start` server and assert over http, so they need a run mode that a generic e2e invocation
cannot infer on its own: which binary to start, and whether `--rebuild` is even possible for it.
Left ungated they would break under `e2e_test_esbuild_bundle` — that job sweeps every e2e spec file
and runs it with `--rebuild`-by-default logic, but the default bundle distribution does not ship the
UI toolchain (rspack et al., §8.3), so a live rebuild on the bundled binary fails. Both suites
therefore skip entirely unless `BIT_E2E_UI_MODE` is set to one of:

| mode       | binary                                                          | `--rebuild`? | when                                                                                                                                         |
| ---------- | --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild`  | plain non-bundled `bd`/`bit` (`CommandHelper.nonBundledBitBin`) | yes          | local iteration — no pre-bundle needed, but a cold rebuild is minutes                                                                        |
| `prebuilt` | whatever `--bit_bin` selects (`CommandHelper.bitBin`)           | no           | validating the real, shipped artifact — proves `bit start` serves the baked-in pre-bundle rather than falling back to a rebuild it cannot do |

`uiE2eMode()`/`uiE2eHttpHelperOptions()` in `e2e/http-helper.ts` implement this; each test file's
header comment points back here.

**Run `rebuild` mode** (fast, local, describes whatever this repo's source currently is):

```bash
# NOT `npm run e2e-test -- <file>` — that script's spec glob ('./e2e/**/*.e2e*.ts') is baked into
# the command string, so an appended arg adds to it rather than replacing it, and you get the whole
# suite. Invoke mocha directly instead, exactly like e2e-with-bundle.js does for `prebuilt` mode:
BIT_E2E_UI_MODE=rebuild npx mocha --require ./babel-register \
  e2e/harmony/ui-start.e2e.ts e2e/harmony/ui-ssr.e2e.ts
# or add .only per this repo's usual e2e-testing convention and run npm run e2e-test as normal —
# slower (loads every spec file) but fine if you're already running other e2e tests too
```

**Run `prebuilt` mode** (slower to set up, but validates the actual shipped esbuild CLI bundle end
to end — the two, chained together, are the closest thing this branch has to "does `bit start` work
out of the box for someone who installed the bundle"):

```bash
# 1. produce a real local ui/preview pre-bundle from current source (§17i) — this is the slow step
bd build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules \
  --tasks "BundleUI,PreBundlePreview"
BIT_BIN=bd npm run bundle:prebundle-cache:save

# 2. build (or reuse, if the stamp already matches) the esbuild CLI bundle, and run only these two
#    files against it — e2e-with-bundle.js forwards explicit spec paths instead of the full glob,
#    which is what keeps this out of the ordinary e2e sweep even when invoked directly
BIT_E2E_UI_MODE=prebuilt npm run e2e-test:bundle -- e2e/harmony/ui-start.e2e.ts e2e/harmony/ui-ssr.e2e.ts
```

Step 2's `ensureBundle` restores whatever is in `.bundle-cache/` into the bundle automatically (it
does not itself produce a pre-bundle — that is step 1); a stale cache silently tests stale UI code,
same caveat as §17i's "plain file cache, not a freshness gate" note.

**Wired into CI as of 2026-08-19.** `setup_esbuild_bundle` now runs step 1 itself (`./bin/bit.js
build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules --tasks
"BundleUI,PreBundlePreview"` + `bundle:prebundle-cache:save`) before building the esbuild bundle, so
the bundle `e2e_test_esbuild_bundle` runs against always has a fresh pre-bundle baked in — and that
job sets `BIT_E2E_UI_MODE: prebuilt`, so `ui-start.e2e.ts`/`ui-ssr.e2e.ts` run for real as part of
its normal 40-way parallel sweep (unlike step 2 above, there's no need to target the two files
explicitly — they're just two more spec files in that job's split, gated by the env var like
everywhere else). `e2e_test` (the plain, non-bundle suite — currently disabled entirely, see its
comment in `.circleci/config.yml`) still sets no mode, so `rebuild` mode has no CI coverage; that
one is still local-only, per its own tradeoff (a cold `--rebuild` is minutes, not worth paying on
every commit when `prebuilt` mode already covers the shipped artifact).
