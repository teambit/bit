# Bundling the Bit CLI with esbuild — Plan, Architecture & Status Report (index)

> Branch: `bit-bundle3` (based on `remove-core-envs-from-manifest`)
> Status: **working end-to-end** — and now also **as a real `bit build` task**, with types.
> Last updated: 2026-08-18 (produced a real local UI/preview pre-bundle for the first time — the
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

|                     | released bit (bvm 2.0.72) | bundled bit (this branch)                                                                                 |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| install size        | **1.2 GB**                | **216 MB** (60 MB bundle + 63 MB externals + ~93 MB shims, incl. the 83 MB pre-bundled UI/preview — §17i) |
| files on disk       | **141,008**               | **~2,900**                                                                                                |
| `bit --help` (warm) | 0.662 s                   | **0.642 s** (SEA: 1.324 s — §9)                                                                           |
| `bit list` (warm)   | 0.914 s                   | **0.848 s** (SEA: 1.574 s)                                                                                |
| single executable   | —                         | **179 MB `bit-app`** (+ the `bundle/` support dir)                                                        |
| build time          | n/a                       | ~11 s esbuild + ~5 s codegen (+ ~40 s for the SEA variant)                                                |

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

## Section-number cross-reference

The files above keep the original `§N` numbering from the single-file era (many cross-references in
commit messages, PRs and other files still say e.g. "§17d" or "§9b") — the mapping is: file `NN-*.md`'s
leading number is one greater than the `§` section it holds for sections 1–13 (e.g. `14-known-gaps.md`
is §10), then `18-findings-log.md` is §14, and files 19–23 hold §15–§19 in order. When in doubt, grep
`bundle-plan/` for the `§` reference or the heading text.
