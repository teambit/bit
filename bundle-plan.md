# Bundling the Bit CLI with esbuild — Plan, Architecture & Status Report (index)

> Branch: `bit-bundle3` (based on `remove-core-envs-from-manifest`)
> Status: **working end-to-end** — and now also **as a real `bit build` task**, with types.
> Last updated: 2026-09-08 (renamed the `setup_esbuild_bundle` CI job to `build_esbuild_bundle` -
> it builds the bundle, it doesn't set anything up - and moved the size guard's `post`-phase check
> out of `e2e_test_ui_prebundle` into a new `check_ui_prebundle_size` job that runs
> `inject_ui_prebundle` + the check as build validation, before the e2e job even starts;
> `e2e_test_ui_prebundle` now just attaches the already-injected, already-checked bundle. See
> [17-decisions-taken.md](bundle-plan/17-decisions-taken.md) D18.)
> Previously, 2026-09-08 (the size guard's first real CI run showed the `pre`-phase baseline, captured
> on a local macOS build, undercounting `node_modules` externals by ~9% vs. real CircleCI (Linux) -
> platform-specific native binaries, not a regression. Recalibrated the baseline from the real CI
> job's own report, and added `total-pre`/`total-post` checks that measure the _entire_ out-dir as a
> catch-all, not just the twelve named sub-paths. See
> [18-findings-log.md](bundle-plan/18-findings-log.md)'s 2026-09-08 entry.)
> Previously, 2026-09-08 (added a CI size guard, `scripts/bundle-size-guard.mjs` +
> `scripts/bundle-size-baseline.json`, direct response to the SSR 6 MB → 53 MB regression below —
> two `--phase` runs, `pre` in `build_esbuild_bundle` and `post` in `check_ui_prebundle_size`, each
> checking the bundle file, externals, shims, browser barrels, UI/preview prebundle, SSR, UI vendor
> DLL, and the combined `dist/core-aspects` folder, with 10% growth margin before failing. See
> [18-findings-log.md](bundle-plan/18-findings-log.md)'s 2026-09-08 entry and
> [17-decisions-taken.md](bundle-plan/17-decisions-taken.md) D18.)
> Previously, 2026-09-08 (root-caused PR #10690's `e2e_test_esbuild_bundle` CI failure via the
> `circleci` CLI: `ui-vendor-dll.e2e.ts` was missing the `BIT_E2E_UI_MODE` gate its
> `ui-start.e2e.ts`/`ui-ssr.e2e.ts` siblings have, so it ran unguarded and hit the missing
> `--ui-bundling` toolchain — fixed by adding the same gate. Separately, 3/40 executions hit an
> unrelated, pre-existing `TS5107 moduleResolution=node10` failure, confirmed unrelated to this
> branch and left open. See [18-findings-log.md](bundle-plan/18-findings-log.md)'s 2026-09-08 entry
> and [14-known-gaps.md](bundle-plan/14-known-gaps.md) gaps 12/13.)
> Previously, 2026-09-08 (root-caused and fixed the ~53 MB SSR-bundle regression flagged on
> 2026-09-06/07: `@teambit/ui`'s barrel re-exports `BundleUiTask` as a value, which pulled
> `ui-vendor-dll.ts`'s `@rspack/core` import — and its ~40 MB native binding — into the shipped SSR
> bundle. Fixed by externalizing `@rspack/core` in `rspack.ssr.config.ts`, matching the browser
> config's existing externals. Verified safe (not just smaller) against a real default,
> non-`--ui-bundling` build: `@rspack/core` confirmed absent from `node_modules`, 16/16 e2e passing
> including real SSR render (`ui-ssr.e2e.ts`/`ui-start.e2e.ts`), plus a manual scope/browser check.
> SSR artifact 52.76 MB → 6.35 MB; total distribution 234 MB → 182 MB. See
> [18-findings-log.md](bundle-plan/18-findings-log.md)'s 2026-09-07/08 entry and
> [01-goal-and-results.md](bundle-plan/01-goal-and-results.md)'s updated size table.
> Previously, 2026-09-06 (rebuilt the bundle and the UI/preview pre-bundle from current HEAD
> (`e2245600e`, post the `remove-core-envs-from-manifest` merge) and re-measured every size number
> in this doc against them: **159 MB total** (was 160 MB) — bundle 59 MB (was 60), externals 68 MB
> (was 64, `@pnpm` grew 22→27 MB), shims ~32 MB incl. 16.8 MB UI/preview pre-bundle (was ~33 MB /
> 16.7 MB) — and ~2,812 files (was ~2,839). Same day: reproduced
> [known gap 1](bundle-plan/14-known-gaps.md) cleanly for the first time against a real app
> (`community-cloud`, `CLIENT_ONLY=true`) and wrote up a proposed fix — see
> [26-ui-vendor-dll-design.md](bundle-plan/26-ui-vendor-dll-design.md) (not yet implemented) and
> [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-09-06 entries.
> Later the same day: the vendor DLL is implemented and its manifest is now portable across installs
> — it was keyed by the building install's own pnpm store paths and matched nothing anywhere else;
> consumers now go through `createUiVendorDllReference()`. See D17 in
> [17-decisions-taken.md](bundle-plan/17-decisions-taken.md) and the 2026-09-06 "Task 6" entry.)
> Previously, 2026-09-01 (silenced the 41 `require-resolve-not-external` esbuild warnings via
> `logOverride` instead of externalizing the packages they name — they're the already-gated
> `--ui-bundling` group plus dev-only tooling. See
> [14-known-gaps.md gap 2](bundle-plan/14-known-gaps.md) and
> [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-09-01 entry.)
> Previously, 2026-08-30 (bvm dev pre-releases now publish automatically on every `bit-bundle*`
> push — new `bundle_push_build`/`bundle_publish_to_gcloud` jobs in `build_and_test`, reusing
> `setup_esbuild_bundle`/`build_ui_prebundle`'s persisted workspace output instead of rebuilding from
> scratch. `resolve_bundle_version`/`pack_bvm_tars`/`inject_ui_prebundle` extracted as shared
> `commands:` so the manual `bundle_deploy` workflow and this one share the packing logic. See
> [24-installing-via-bvm.md](bundle-plan/24-installing-via-bvm.md) and the new
> [25-pre-merge-cleanup.md](bundle-plan/25-pre-merge-cleanup.md).)
> Previously, 2026-08-19 (gave `e2e_test_ui_prebundle` the same `bit_global_for_npm`/`bit_config`
> setup `e2e_test_esbuild_bundle` gets via `e2e_test_cmd`, and bumped the `bit --help` timing
> budget in `filesystem-read.e2e.ts` from 1500ms to 2500ms based on 10 real CI measurements
> (1720-2270ms) — see [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-08-19 entries.)
> Previously, same day (rebuilt the UI/preview pre-bundle and `.bundle-cache/` from current
> source after the merge below — UI artifact **80 MB → 16 MB** (#10629's single-compilation dedupe,
> now reflected on this branch); found and fixed a real bug in the e2e `HttpHelper` where a
> multi-word server binary crashed `spawn()` with an unhandled `'error'` event, silently hanging
> instead of failing; verified end to end against a real `npm run bundle` build — 16/16 UI-bundling
> sanity tests passing, including SSR. Total shipped distribution now **160 MB / 2,839 files** (was
> 216 MB / 2,933). See [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-08-19 entries, and
> PRs #10628/#10629/#10631 for the upstream work behind the size drop.)
> Previously, same day (merged `origin/remove-core-envs-from-manifest` again — upstream
> replaced `BundleUiTask`/`UiMain.build`'s per-root two-compilation UI bundling with a single
> rspack compilation covering both roots; reconciled by hand, keeping upstream's architecture and
> single-hash-file layout while porting this branch's `forPreBundle` core-aspect filtering and
> `getAspectArtifactDir`-based `getBundleUiPath` fix onto it. See
> [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-08-19 entry)
> Previously, 2026-08-18 (produced a real local UI/preview pre-bundle for the first time — the
> `WorkspaceAspectsLoader` hang blocking `bd build` is fixed upstream — added a gitignored
> `.bundle-cache/` so it survives `node_modules` wipes, and stopped shipping esbuild's 8.9 MB
> `metafile.json` inside the published package (still written for local/CI builds), and moved
> `@rspack/core` (42 MB, the single biggest external) out of the default install into
> `UI_BUNDLING_EXTERNALS` + `stub-dev-only-plugin.ts`, since `bit start` never needs it once it's
> serving the pre-bundle. Total shipped distribution now measured at **216 MB / 2,933 files** (was
> 322 MB in the original 2026-08-16 estimate). See
> [21-bit-start-prebundles.md §17i](bundle-plan/21-bit-start-prebundles.md#17i-producing-a-real-local-pre-bundle-and-caching-it-2026-08-18)
> and [18-findings-log.md](bundle-plan/18-findings-log.md), 2026-08-18 entries)
> Previously, 2026-08-16 (merged `remove-core-envs-from-manifest`, which brought in the upstream
> webpack/react-env decoupling; removed `webpack`, `process/browser`, `buffer/`, and `@babel/core` from
> externals as a result — down to 11 (was 16 at the start of the day). `bit install` needed two passes
> post-merge; found and documented a pre-existing, unrelated `WorkspaceAspectsLoader` hang bug blocking
> local `bit build`/`bit status` on this branch; genuinely excluded `@rspack/dev-server` and
> `workbox-webpack-plugin` (not moved to externals — a new esbuild plugin stubs them out) since both
> were only reachable from already-out-of-scope/already-broken paths, and the real `webpack` package
> they pulled in transitively went with them — bundle **78.3 MB → 60.15 MB** —
> [18-findings-log.md](bundle-plan/18-findings-log.md))

This file is the table of contents. **The content used to live in one 2500-line file; it is now split
into topic files under `bundle-plan/`, one per section, so a session only has to load what's relevant.**
Read this index first, then open only the file(s) you need. See `CLAUDE.local.md` for how to keep this
doc updated as you work.

## At a glance

|                     | released bit (bvm 2.0.72) | bundled bit (this branch)                                                                                                                                          |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| install size        | **1.2 GB**                | **159 MB** (59 MB bundle + 68 MB externals + ~32 MB shims, incl. the 16.8 MB pre-bundled UI/preview — §17i, measured 2026-09-06 on a fresh build from `e2245600e`) |
| files on disk       | **141,008**               | **~2,812**                                                                                                                                                         |
| `bit --help` (warm) | 0.662 s                   | **0.642 s** (SEA: 1.324 s — §9)                                                                                                                                    |
| `bit list` (warm)   | 0.914 s                   | **0.848 s** (SEA: 1.574 s)                                                                                                                                         |
| single executable   | —                         | **179 MB `bit-app`** (+ the `bundle/` support dir)                                                                                                                 |
| build time          | n/a                       | ~11 s esbuild + ~5 s codegen (+ ~40 s for the SEA variant)                                                                                                         |

Full detail in [01-goal-and-results.md](bundle-plan/01-goal-and-results.md).

## Table of contents

**Getting started**

- [01 — Goal & result so far](bundle-plan/01-goal-and-results.md)
- [02 — How to build and run it](bundle-plan/02-build-and-run.md)
- [03 — Output layout](bundle-plan/03-output-layout.md)

**How it works**

- [04 — Architecture](bundle-plan/04-architecture.md) (the three structural problems, the shim trick, load flow)
- [05 — The bundler](bundle-plan/05-bundler-internals.md) (files in `scopes/harmony/bit/bundle/`)
- [06 — The four problems that actually mattered](bundle-plan/06-key-problems-solved.md) (mixed `@teambit/*` resolution, `hook-require` prototype pollution, ESM named exports, native code/child processes)

**Is it correct, and how big is it**

- [07 — Verification](bundle-plan/07-verification.md) (40-command matrix, SEA, isolation, no-regression)
- [08 — What is installed next to the bundle, and why](bundle-plan/08-externals-inventory.md) (the externals table, optimisation levers, the `--ui-bundling` group)

**Script bundle vs. single executable, and shipping shape**

- [09 — Script bundle vs. single executable (SEA)](bundle-plan/09-sea-vs-script.md) (timings, why SEA is slower, pros/cons, recommendation)
- [10 — What the published `@teambit/bit` package should look like](bundle-plan/10-published-package-shape.md) (§9b)
- [11 — Running the e2e suite against the bundle](bundle-plan/11-e2e-suite.md) (§9c)
- [12 — First full CI run — results](bundle-plan/12-first-ci-run.md) (§9d)
- [13 — The build task status](bundle-plan/13-build-task-status.md) (§9e, `BundleCliAppTask`)

**Where things stand**

- [14 — Known gaps & limitations](bundle-plan/14-known-gaps.md) (§10)
- [15 — Next steps](bundle-plan/15-next-steps.md) (§11)
- [16 — Open questions for you](bundle-plan/16-open-questions.md) (§12)
- [17 — Decisions taken (and why)](bundle-plan/17-decisions-taken.md) (§13, table D1–D15)
- [18 — Findings log](bundle-plan/18-findings-log.md) (§14, append-only, dated — the most detailed, most frequently updated file)

**Deep dives / research sessions**

- [19 — Externals research: can webpack or mocha be dropped from core?](bundle-plan/19-externals-research-webpack-mocha.md) (§15, 2026-08-10)
- [20 — Externals research: `@babel/core`, `bufferutil`/`utf-8-validate`, `mcp-config-writer`](bundle-plan/20-externals-research-babel-ws-mcp.md) (§16, 2026-08-10)
- [21 — Making `bit start` work from the pre-bundles](bundle-plan/21-bit-start-prebundles.md) (§17, 2026-08-11)
- [22 — `mcp-config-writer` inlined into the bundle instead of copied](bundle-plan/22-mcp-config-writer-inlined.md) (§18, 2026-08-11)
- [23 — `BabelAspect` removed from core, and why `@babel/core` still can't leave externals](bundle-plan/23-babel-aspect-removed.md) (§19, 2026-08-12)

**Shipping the branch**

- [24 — Handing the branch out through bvm](bundle-plan/24-installing-via-bvm.md) (the tar layout bvm expects, `pack-bundle-for-bvm.js`, pre-release versioning and the `dev` release type)
- [25 — Cleanup before merging into master](bundle-plan/25-pre-merge-cleanup.md) (running checklist, distinct from the known-gaps list)

**Design work in progress**

- [26 — Design: a UI vendor DLL, so a third-party UI root doesn't need a full rebuild](bundle-plan/26-ui-vendor-dll-design.md) (proposed fix for [known gap 1](bundle-plan/14-known-gaps.md), 2026-09-06 — in progress)
- [27 — Implementation plan: UI vendor DLL (bit-bundle3 side)](bundle-plan/27-ui-vendor-dll-plan.md) (this repo's half — the `bit-cloud` integration plan lives in `/Users/giladshoham/dev/temp/bit-cloud-bundle/VENDOR_DLL_INTEGRATION_PLAN.md`, a separate workspace)

## Section-number cross-reference

The files above keep the original `§N` numbering from the single-file era (many cross-references in
commit messages, PRs and other files still say e.g. "§17d" or "§9b") — the mapping is: file `NN-*.md`'s
leading number is one greater than the `§` section it holds for sections 1–13 (e.g. `14-known-gaps.md`
is §10), then `18-findings-log.md` is §14, and files 19–23 hold §15–§19 in order. When in doubt, grep
`bundle-plan/` for the `§` reference or the heading text.
