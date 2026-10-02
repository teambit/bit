# 7. Verification

[← back to bundle-plan index](../bundle-plan.md)

### 7.1 Command matrix — 40 commands run from the bundle

All against `/tmp/bundle-tests/ws2` (a real workspace with a created, snapped, tagged component).

| ✅ working    |                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| lifecycle     | `init`, `create aspect`, `compile`, `status`, `status --json`, `list`, `show`, `log`, `diff`, `snap`, `tag`, `export`, `import` |
| build         | `build --unmodified` — **all 9 tasks**, incl. Vitest, schema extraction, Rspack preview bundling, PreBundlePreview              |
| analysis      | `schema`, `deps get`, `graph --json`, `insights`, `why`\*, `dependents`\*                                                       |
| lanes         | `lane list`, `lane create`, `lane show`, `lane switch`, `lane remove`                                                           |
| quality       | `test`, `lint`, `format`                                                                                                        |
| workspace     | `install`, `link`, `envs`, `aspect list`, `templates`, `clear-cache`, `doctor`                                                  |
| config/system | `config list`, `globals`, `system log`, `cat-component`, `cat-scope`                                                            |
| long-running  | `watch` (compiles + watches), `server` (HTTP API responds)                                                                      |

\* `why`, `dependents`, `format --check` and `eject --help` exit non-zero — **identically to the
released `bit`** on the same workspace, so they are pre-existing behaviour, not bundle regressions
(verified side by side).

| ✅ working since 2026-08-11 |                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bit start`                 | serves the shipped UI and preview pre-bundles from the shims — no bundler runs, and none of the UI-bundling externals are needed. Was `Cannot find module '@teambit/mdx.modules.mdx-v3-options'` before (§17). |

### 7.2 Single executable

`npm run bundle -- --sea` produces `/tmp/bit-bundle/bit-app` (179 MB). Verified: `--version`,
`--help`, `init`, `create aspect` (incl. pnpm install), `status`, `list`, `show`,
`build --unmodified` (all 9 tasks). Details and caveats in §9.

### 7.3 Isolation

- `BIT_LOG=* bit status` from the bundle → **0** log lines mentioning `dev/bit/bit`, **0** mentioning
  `.bvm`.
- A probe script resolved core aspects through the bundle's own resolution path:
  `teambit.workspace/workspace → /private/tmp/bit-bundle/node_modules/@teambit/workspace`, and
  `getAspectDef(…, 'main')` returned existing `dist/workspace.aspect.js` /
  `dist/workspace.main.runtime.js`.

### 7.4 No regression to the normal build

`npm run lint` (tsc --noEmit + oxlint) → 0 errors. `bd --version`, `bd list`, `bd status`,
`bd compile` all fine after the `hook-require` change.
