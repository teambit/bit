# 9d. First full CI run — results

[← back to bundle-plan index](../bundle-plan.md)

Pipeline `735761af` on `bb86f8828`. `setup_esbuild_bundle` **passed** (210 s: build + externals
install + smoke tests) with the same numbers as local: 66.58 MB bundle, 106 core aspects, 11
externals, 0 unresolved, 107 ESM bridges, 0 errors.

`e2e_test_esbuild_bundle` ran the full suite across 40 nodes. Compared against the **baseline
`e2e_test` job from the same pipeline**, which is the only fair reading — the baseline is not green
on this branch either:

|                                   | tests | failures |
| --------------------------------- | ----- | -------- |
| baseline `e2e_test`               | 2876  | 23       |
| bundled `e2e_test_esbuild_bundle` | 2837  | 41       |

**All 23 baseline failures also fail in the bundle, and 0 failures are unique to the baseline** — the
bundle's failures are a strict superset, so the delta is exactly **18 bundle regressions**:

| #   | cause                                                                                                | tests                                                                                                 | already known?                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `failed to start the UI server` — the http/lane/ci e2e specs serve a remote scope via `bit start`    | `http.e2e.ts` ×4, `ci-commands.e2e.ts` ×3, `lane-export-skip-main-history-http.e2e.ts` ×1, +1 cascade | **yes** — §10.1. This measures its real blast radius: the UI server is not just `bit start`, it backs the HTTP remote protocol.                       |
| 2   | `Cannot find module '@teambit/mdx.modules.mdx-v3-options'` in `bit build` with a preview/bundler env | `custom-env-operations-2.e2e.ts` ×2                                                                   | **yes** — §8.3                                                                                                                                        |
| 1   | `Cannot find module 'process/browser'` on `bit tag --build`                                          | `custom-env-operations.e2e.ts`                                                                        | **yes** — §10.2                                                                                                                                       |
| 2   | `Cannot find module './get-uid-gid.js'` on `bit export` to a shared-flag remote                      | `export.e2e.ts` ×2                                                                                    | **yes** — §10.2                                                                                                                                       |
| 2   | `Cannot find module '@yarnpkg/plugin-npm'` on `bit install` with the yarn package manager            | `root-components-yarn.e2e.ts` ×2                                                                      | **no** — the yarn aspect was not on the externals radar                                                                                               |
| 1   | `node-gyp rebuild exited with status 127`                                                            | `node-gyp.e2e.ts`                                                                                     | **no** — `node-gyp/bin/node-gyp.js` was in the warning list but its absence from PATH is a separate problem                                           |
| 1   | **`zlib.inflate … incorrect header check`** on a scope object written by the bundled binary          | `repository-hooks-aspects.e2e.ts`                                                                     | **no — investigate first**                                                                                                                            |
| 1   | `bit --help` took 1849 ms against a 1500 ms budget                                                   | `filesystem-read.e2e.ts`                                                                              | **no** — locally the bundle beats bvm (0.64 s vs 0.66 s); the CI number suggests the compile cache is not being reused between spawned commands there |

### Reading

Two thirds of the delta (12 of 18) is the **already-documented** UI-bundling / `require.resolve`
surface. The CI run's value is that it turned "silent landmines" (§10.2) into a ranked list with
exact call sites, and showed that the UI server matters more than assumed — it backs the HTTP remote
protocol, not only `bit start`.

Priority order for the next pass:

1. **`repository-hooks-aspects` zlib corruption.** A data-integrity failure outranks every missing
   module here. Objects written by the bundled binary failed to inflate; nothing else in the run
   points at a cause yet, and it must be understood before the bundle is trusted with real scopes.
2. **The UI server** (9 tests). Same root cause as `bit start`; §11A.1 still applies — fix by
   resolving the UI graph from the pre-bundled artefact, not by growing the externals list.
3. **Cheap externals** — `process/browser` and `uid-number`/`get-uid-gid`: **done 2026-08-12**, see
   §14. `@yarnpkg/plugin-npm` (the yarn plugin family): not pursued — yarn support is being dropped
   entirely, the e2e coverage for it is now `describe.skip`'d instead (§14, 2026-08-12). `node-gyp`:
   root-caused 2026-08-12 (§14) — it IS the same RUNTIME_PATH gap, just not yet applied; still open
   pending confirmation.
4. **The startup budget** — check whether `module.enableCompileCache()` actually has a writable
   cache dir under the CI user, since the local measurement says the bundle should pass this test.
