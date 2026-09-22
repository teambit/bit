# 2. How to build and run it

[← back to bundle-plan index](../bundle-plan.md)

```bash
bit compile                     # the bundle is built FROM dist/, so this must be current
npm run bundle                  # → /tmp/bit-bundle
cd /tmp/bit-bundle/bundle && npm install     # the externals, ~230 packages

node /tmp/bit-bundle/node_modules/@teambit/bit/bin/bit --help
```

| flag                                      | meaning                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `--out-dir <path>`                        | where to write the distribution (or `BIT_BUNDLE_OUT_DIR`)                               |
| `--sea`                                   | also build the single executable → `<out>/bit-app`                                      |
| `--ui-bundling`                           | add the UI/preview bundling externals — makes `bit start` work, **costs 1.1 GB** (§8.3) |
| `--minify` / `--sourcemap` / `--no-clean` | as expected                                                                             |

A clean run keeps `bundle/node_modules`, so the `npm install` is only needed when `externals.ts`
changes. `npm run bundle:ensure` does build-only-if-stale (§9c) and also runs the `npm install` for
you, which is usually what you want:

```bash
npm run bundle:ensure            # build iff stale, then install externals
npm run bundle:ensure -- --sea   # same, plus the executable
```
