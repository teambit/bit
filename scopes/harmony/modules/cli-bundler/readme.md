# Bundling the Bit CLI

Builds the whole CLI into one CommonJS file with esbuild, plus a small ring of packages that cannot
be inlined. See `bundle-plan.md` at the repo root for the architecture, the reasoning and the
current status.

## Build

```bash
bit compile          # REQUIRED - the bundle is built from dist/, not from the TS sources
npm run bundle       # → /tmp/bit-bundle
```

| flag               | meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `--out-dir <path>` | where to write the distribution (also `BIT_BUNDLE_OUT_DIR`)                                                 |
| `--sea`            | also build the Node single executable → `<out>/bit-app`                                                     |
| `--ui-bundling`    | add the UI/preview bundling externals so `bit start` can run — **costs ~1.1 GB**, see `bundle-plan.md` §8.3 |
| `--minify`         | minify the bundle                                                                                           |
| `--sourcemap`      | emit a linked source map                                                                                    |
| `--no-clean`       | keep whatever is already in the out dir                                                                     |

A clean run wipes everything except `bundle/node_modules`, so the externals survive rebuilds.

## Build only if stale

```bash
npm run bundle:ensure           # builds iff the stamp doesn't match, then installs externals
npm run bundle:ensure -- --sea  # same, plus the executable
npm run bundle:ensure -- --force / --no-build
```

`ensure-bundle.ts` stamps the out dir with the bit version, node/platform/arch, the newest `dist`
mtime across every workspace component, the bundler's own mtimes and the externals list. One rule -
build iff the stamp differs - gives CI a single build per split machine and gives a local run an
automatic rebuild whenever anything was recompiled. See `bundle-plan.md` §9c.

## Run

```bash
cd /tmp/bit-bundle/bundle && npm install       # only when externals.ts changed
node /tmp/bit-bundle/node_modules/@teambit/bit/bin/bit --help
```

`--help`, `init`, `status` and `list` work without the `npm install`; anything that installs
packages needs it (`@pnpm/napi` is a native module and cannot be bundled).

## What gets generated

- `bundle/bit.app.js` — the CLI. Exports every core aspect's API **and** `runBitApp()`; it does not
  start the CLI on import, because the shims below `require` it.
- `node_modules/@teambit/<aspect>/` — one shim package per core aspect, re-exporting its slice of the
  bundle. These are what a user's `bit install` symlinks into their workspace, and what
  `getAspectDir` / `getAspectDef` discover.
- `node_modules/@teambit/<aspect>/dist/esm.mjs` — named-export bridges for ESM consumers, **derived
  from the built bundle** rather than hand-written.
- `bundle/workers/*.js` — entry points loaded by child processes, each its own self-contained bundle.
- `bundle/package.json` — the externals. Installed inside `bundle/` so a package manager run there
  can never prune the generated shims one level up.

## Adding to `externals.ts`

Only three things justify an entry: a native addon, a file a child process loads by path, or a
toolchain a user's env resolves by name. Everything else should be attempted in-bundle first. The
build prints any external it could not resolve a version for, so the list stays honest.

## e2e against the bundle

```bash
npm run e2e-test:bundle                              # whole suite
npm run e2e-test:sea
npm run e2e-test:bundle -- ./e2e/commands/cat.e2e.ts # one spec (extra args go to mocha)
npm run e2e-test:bundle-circle                       # CircleCI reporters
```

## Single executable

`npm run bundle -- --sea` runs the whole Node SEA pipeline (blob → copy node → postject → codesign)
and leaves a working `<out>/bit-app`. It still needs `bundle/` on disk next to it: the externals are
native packages, and bit reads data files off disk. Startup is currently ~2x slower than the script
launcher — see `bundle-plan.md` §9.
