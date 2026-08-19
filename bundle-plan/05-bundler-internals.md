# 5. The bundler

[← back to bundle-plan index](../bundle-plan.md)

`scopes/harmony/bit/bundle/` — run with `npm run bundle`.

| file                                                                      | role                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bundle.ts`                                                               | orchestrator, flags, summary; selective clean that preserves installed externals                                                                                                     |
| `config.ts`                                                               | every path in one place                                                                                                                                                              |
| `core-aspects-info.ts`                                                    | per aspect: package name, dir, and the **actual** `*.aspect` / `*.main.runtime` file names (not derivable from the id — `teambit.envs/envs` lives in `environments.main.runtime.ts`) |
| `generate-entry.ts`                                                       | writes the entry, the SEA entry and the two barrels into `node_modules/.bit-bundle`                                                                                                  |
| `run-esbuild.ts`                                                          | the single `build()` call, with an optional SEA wrapper                                                                                                                              |
| `externals.ts`                                                            | the lean list + the opt-in UI group, each entry with a stated reason                                                                                                                 |
| `plugins/teambit-dist-resolver-plugin.ts`                                 | the most important plugin — §6.1                                                                                                                                                     |
| `plugins/worker-entry-plugin.ts`, `worker-entries.ts`, `build-workers.ts` | child-process entry points, built as their own bundles                                                                                                                               |
| `plugins/ignore-assets-plugin.ts`                                         | `.css/.scss/.mdx/.md` → empty module                                                                                                                                                 |
| `generate-shim-packages.ts`                                               | the 108 `@teambit/*` shim packages                                                                                                                                                   |
| `generate-esm-bridges.ts`                                                 | derives each shim's `esm.mjs` **from the built bundle** — §6.3                                                                                                                       |
| `copy-assets.ts`                                                          | files read via `path.join(__dirname, …)`, with collision detection                                                                                                                   |
| `build-sea.ts`                                                            | Node single-executable build (§9)                                                                                                                                                    |
| `ensure-bundle.ts`                                                        | build-iff-stale + stamp, used by the e2e runners (§9c)                                                                                                                               |
| `create-package-json.ts`, `generate-npmrc.ts`, `generate-bin.ts`          | the distribution's metadata & launcher                                                                                                                                               |

Nothing generated is written into the source tree: the entry and barrels go to
`node_modules/.bit-bundle`, so git, `tsc` and oxlint never see them.
