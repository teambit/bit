# Audit 1.1 — Workspace/Consumer Load Method Call Sites

**Scope:** all of `scopes/` and `components/` (excluding `e2e/` and `node_modules`).
**Total call sites:** 88 across 6 method names.
**Generated:** as part of OpenSpec change `rewrite-component-loading`, pre-work task 1.1.

## Method totals

| Method                                  | Sites |
| --------------------------------------- | ----- |
| `workspace.get(`                        | 33    |
| `workspace.getMany(`                    | 21    |
| `workspace.list(`                       | 14    |
| `workspace.listWithInvalid(`            | 2     |
| `workspace.listInvalid(`                | 0     |
| `workspace.getConsumerComponent(`       | 0     |
| `consumer.loadComponents(`              | 12    |
| `consumer.loadComponent(`               | 4     |
| `consumer.loadComponentFromFileSystem(` | 0     |

## Summary by load shape

| Shape          | Count |
| -------------- | ----- |
| `files`        | 29    |
| `?` ambiguous  | 18    |
| `extensions`   | 13    |
| `dependencies` | 10    |
| `identity`     | 8     |
| `aspects`      | 6     |

The `?` bucket is large enough that we should plan to revisit each one during stage-2 migration; assigning a phase to those sites needs reading surrounding code.

---

## DEPENDENCIES (10)

`workspace.get(`:

- `scopes/dependencies/dependencies/dependencies.main.runtime.ts:222` — `const component = await this.workspace.get(compId);` (missing-packages analysis)
- `scopes/dependencies/dependencies/dependencies.main.runtime.ts:357` — `const component = await this.workspace.get(compId);` (debug deps mode)
- `scopes/dependencies/dependencies/dependencies.main.runtime.ts:391` — `await this.workspace.get(id.changeVersion(logItem.tag || logItem.hash));` (blame deps across versions)
- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:590` — internal `consumer.loadComponents` call

`workspace.getMany(`:

- `scopes/workspace/workspace/filter.ts:57` — filter by env
- `scopes/workspace/workspace/filter.ts:70` — filter by modified status
- `scopes/workspace/workspace/filter.ts:94` — filter by code modified
- `scopes/workspace/workspace/filter.ts:107` — filter by complex state
- `scopes/compilation/compiler/workspace-compiler.ts:480` — load for compile (then reload at 483)
- `scopes/compilation/compiler/workspace-compiler.ts:483` — reload after env loading
- `scopes/component/snapping/snapping.main.runtime.ts:1142` — fresh post-cache-clear load

`workspace.list(`:

- `scopes/dependencies/dependencies/dependencies.main.runtime.ts:436` — usage tracking
- `scopes/dependencies/dependencies/dependencies.main.runtime.ts:458` — all-components dep scan
- `scopes/component/snapping/version-maker.ts:113` — auto-tag dep tracking

`consumer.loadComponents(`:

- `scopes/workspace/workspace/auto-tag.ts:19` — auto-tag dep graph

---

## EXTENSIONS (13)

`workspace.get(`:

- `scopes/harmony/aspect/aspect.main.runtime.ts:160` — `component.state.aspects`
- `scopes/harmony/aspect/aspect.main.runtime.ts:173` — debug aspects + componentExtensions/beforeMerge
- `scopes/component/dev-files/dev-files.main.runtime.ts:220` — `loadExtensions: false` (note: caller already opts out; verify shape)
- `scopes/generator/generator/component-generator.ts:257` — envs.hasEnvConfigured / envs.getEnv

`workspace.getMany(`:

- `scopes/harmony/aspect/aspect.main.runtime.ts:139` — unsetAspectsFromComponents
- `scopes/harmony/aspect/aspect.main.runtime.ts:197` — updateAspectsToComponents
- `scopes/harmony/application/application.main.runtime.ts:210` — explicit `loadExtensions: true, executeLoadSlot: true, loadSeedersAsAspects: true`

`workspace.list(`:

- `scopes/component/renaming/renaming.main.runtime.ts:147` — refactor packages across all
- `scopes/component/forking/forking.main.runtime.ts:297` — env detection during fork
- `scopes/component/forking/forking.main.runtime.ts:395` — env detection during multi-fork

---

## ASPECTS (6)

`workspace.getMany(`:

- `scopes/harmony/api-server/api-for-ide.ts:550` — autoTag config diff
- `scopes/harmony/api-server/api-for-ide.ts:552` — locallyDeleted config diff
- `scopes/typescript/typescript/typescript.main.runtime.ts:319` — TS file collection (verify)

`workspace.list(`:

- `scopes/defender/tester/tester.main.runtime.ts:194` — uiWatch test execution
- `scopes/git/ci/ci.main.runtime.ts:345` — verifyWorkspaceStatus → builder.build

---

## FILES (29)

`workspace.get(`:

- `scopes/harmony/api-server/api-for-ide.ts:165` — getMainFilePath (`comp.state._consumer.mainFile`)
- `scopes/harmony/api-server/api-for-ide.ts:319` — getCompFiles (`comp.state.filesystem.files`)
- `scopes/harmony/api-server/api-for-ide.ts:733` — getCompDetails
- `scopes/workspace/install/install.main.runtime.ts:281` — env loading file checks
- `scopes/workspace/install/install.main.runtime.ts:1060` — env.jsonc parse/update
- `scopes/workspace/watcher/watcher.ts:663` — componentMap & relative files
- `scopes/component/remove/remove.main.runtime.ts:284` — getRemoveInfo config
- `scopes/component/renaming/renaming.main.runtime.ts:105` — componentPackageName
- `scopes/component/renaming/renaming.main.runtime.ts:120` — refactor variable/class names in source
- `scopes/component/renaming/renaming.main.runtime.ts:141` — target component files
- `scopes/component/forking/forking.main.runtime.ts:87` — fork file checks
- `scopes/component/forking/forking.main.runtime.ts:152` — fork files
- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:689` — internal `consumer.loadComponent`
- `scopes/pipelines/builder/build.cmd.ts:181` — builder.listTasks
- `scopes/component/component-log/component-log.main.runtime.ts:331` — historical version files

`workspace.getMany(`:

- `scopes/workspace/install/install.main.runtime.ts:1324` — comp dirs mapping
- `scopes/workspace/modules/node-modules-linker/codemod-components.ts:58` — codemod relative paths
- `scopes/workspace/modules/node-modules-linker/node-modules-linker.ts:322` — explicit `loadSeedersAsAspects: false, loadExtensions: false`
- `scopes/component/component-compare/component-compare.main.runtime.ts:190` — file diff
- `scopes/component/stash/stash.main.runtime.ts:41` — head + isModified
- `scopes/defender/linter/lint.cmd.ts:148` — lint
- `scopes/defender/formatter/format.cmd.ts:85` — format

`workspace.list(`:

- `scopes/harmony/api-server/api-for-ide.ts:246` — getCompsMetadata
- `scopes/workspace/install/install.main.runtime.ts:850` — \_getAllMissingPackages
- `scopes/workspace/install/install.main.runtime.ts:1097` — getAllComponentsDirs
- `scopes/workspace/install/install.main.runtime.ts:1117` — getComponentsManifests
- `scopes/workspace/install/install.main.runtime.ts:1475` — getAllComponentsDirs (variant)
- `scopes/workspace/workspace-config-files/workspace-config-files.main.runtime.ts:361` — component.json ops

`consumer.loadComponents(`:

- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:880` — main-loader internal
- `scopes/workspace/eject/components-ejector.ts:118` — eject prep
- `scopes/component/remove/remove-components.ts:158` — remove load
- `scopes/components/legacy/component-list/components-list.ts:150` — listNewComponents
- `scopes/components/legacy/component-list/components-list.ts:229` — getFromFileSystem

`consumer.loadComponent(`:

- `scopes/components/legacy/component-list/components-list.ts:197` — single load for out-of-sync fix

---

## IDENTITY (8)

`workspace.get(`:

- `scopes/component/deprecation/deprecation.main.runtime.ts:80` — deprecated config marker
- `scopes/component/remove/remove.main.runtime.ts:412` — getHeadIfExists

`workspace.getMany(`:

- `scopes/component/remove/remove.main.runtime.ts:125` — markRemoveComps (uses `_consumer`; verify if files needed)
- `scopes/component/status/status.main.runtime.ts:197` — `opts.showIssues ? full : []`

`consumer.loadComponent(`:

- `scopes/component/component/show/legacy-show/get-consumer-component.ts:8` — recent vs model
- `scopes/scope/importer/import-components.ts:851` — three-way merge

---

## AMBIGUOUS (18) — to revisit during migration

`workspace.get(`:

- `scopes/workspace/install/install.cmd.tsx:111`
- `scopes/workspace/workspace/workspace.main.runtime.ts:243` — LegacyComponentLoader subscriber (conversion path)
- `scopes/workspace/workspace/build-graph-ids-from-fs.ts:185`
- `scopes/workspace/workspace/build-graph-from-fs.ts:188`
- `scopes/workspace/workspace/workspace-aspects-loader.ts:764` — aspect loading; very likely `aspects`
- `scopes/workspace/watcher/watcher.ts:785` — return value unused
- `scopes/workspace/modules/node-modules-linker/codemod-components.ts:82`
- `scopes/generator/generator/generator.main.runtime.ts:329` — generator template aspect
- `scopes/semantics/schema/schema.spec.ts:50` — test only

`workspace.listWithInvalid(`:

- `scopes/component/remove/remove-components.ts:135`
- `scopes/component/status/status.main.runtime.ts:93` — **status command's primary call** (target for stage-1 migration to `dependencies`)

`consumer.loadComponents(`:

- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:76`
- `scopes/component/checkout/checkout.main.runtime.ts:470`
- `scopes/scope/export/export.main.runtime.ts:747` — out-of-sync fix; return unused

---

## Notable findings

- **`workspace.listInvalid()` and `workspace.getConsumerComponent()` have zero callers** — both can be deleted as part of this change rather than migrated. Mark for removal in stage 3.
- **`workspace-component-loader.ts:590, 689, 880` are internal calls** within the loader being rewritten — they vanish along with the file in stage 3 (task 9.1).
- **`workspace.main.runtime.ts:243`** is the LegacyComponentLoader subscriber — this is the bridge invoked when legacy code requests a harmony component. It's exactly the conversion path the rewrite eliminates. Migration of this site = the legacy/harmony bridge collapse.
- **The 7 explicit `loadExtensions: false` / `loadSeedersAsAspects: false` callers** (e.g. `node-modules-linker.ts:322`, `dev-files.main.runtime.ts:220`, `install.main.runtime.ts:1324`) confirm the demand for sub-aspect phases — they're already paying to opt out of full hydration.
- **`workspace.list()` is called 14 times** — every one of those is a candidate for `listIds()` if the caller only needs IDs, or a lower phase otherwise. Several install-command callers (`850, 1097, 1117, 1475`) iterate over `comp.state.filesystem.files` only and never touch extensions — `files` phase is sufficient.
- **`api-for-ide.ts` is a hot caller (5 sites)** — the IDE server triggers loads on every IDE event. Lowering the default phase here will give immediate latency wins for IDE flows.

## Migration phase assignment recommendations

| Default phase to switch to | Sites                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| `identity`                 | the 2 deprecation/remove sites + 2 consumer.loadComponent legacy show             |
| `files`                    | the 29 already classified + several install/list sites currently doing extra work |
| `dependencies`             | the 10 above + `status.main.runtime.ts:93` (currently full hydration)             |
| `extensions`               | the 13 above only                                                                 |
| `aspects`                  | the 6 above only                                                                  |
| revisit                    | the 18 ambiguous sites                                                            |
