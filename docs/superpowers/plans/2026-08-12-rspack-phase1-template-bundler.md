# Rspack Migration Phase 1 — Default Template Bundler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GenerateEnvTemplate` bundles with rspack instead of webpack for every env routed through the default template-bundler group, composing `@teambit/rspack.rspack-bundler` from the `teambit.rspack` scope.

**Architecture:** The default group's bundler chain is `env-preview-template.task.ts` → `teambit.envs/env` (EnvEnv, composed over AspectEnv) → `aspect.env.ts getTemplateBundler` → `reactEnv.createTemplateWebpackBundler`. We add `createTemplateRspackBundler` to `ReactEnv` (composed from the published `RspackBundler` component) and point `aspect.env.ts` at it. Webpack methods stay in place as the opt-in escape hatch. We also add permanent debug logging of group routing (gates Phase 2) and fix the bundler log's env attribution.

**Tech Stack:** TypeScript (CJS), `@teambit/rspack.rspack-bundler@1.0.10` (published component package), existing `@teambit/bundler` interfaces.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-rspack-migration-design.md` (Phase 1 + Phase 2's verify-first diagnostic).
- Compose from `teambit.rspack` published packages; do NOT copy their source into this repo; do NOT modify `teambit.rspack` components.
- Pin `@teambit/rspack.rspack-bundler` to `1.0.10` in `workspace.jsonc`.
- Keep `createTemplateWebpackBundler` and all webpack methods intact (escape hatch / opt-in).
- After every code change: `bit compile <changed component>` then `npm run lint` (canonical; never bare tsc/oxlint).
- Never run `pnpm install` directly; dependency changes go through `workspace.jsonc` + `bit install`.
- All work on branch `rspack-migration`. Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- e2e runs MUST use `.only` on the target describe/it (never run the full suite locally).

---

### Task 1: Routing diagnostic + bundler-attribution fix in the env-template task

**Files:**

- Modify: `scopes/preview/preview/env-preview-template.task.ts` (grouping loop ~lines 62-94; metaData ~lines 103-120)

**Interfaces:**

- Consumes: existing `this.logger` (`Logger` from `@teambit/logger`, already injected in the constructor, line ~55).
- Produces: per-env debug log lines used by Phase 2 to decide the routing fix; corrected `metaData.envId` consumed by both bundlers' progress logs.

- [ ] **Step 1: Add routing debug log inside the grouping loop**

In `execute()`, right after `const shouldUseDefaultBundler = this.shouldUseDefaultBundler(envDef);` (line ~78), add:

```ts
this.logger.debug(
  `EnvPreviewTemplateTask: env "${envDef.id}" routed to template-bundler group "${
    shouldUseDefaultBundler ? 'default (teambit.envs/env)' : envDef.id
  }" (isCoreEnv=${this.aspectLoader.isCoreEnv(envDef.id)}, hasOwnGetTemplateBundler=${
    typeof envDef.env.getTemplateBundler === 'function'
  })`
);
```

- [ ] **Step 2: Fix the env attribution in bundler metaData**

In `runBundlerForGroups()` the `metaData.envId` is set once to `context.id` (the build context env), so the bundler log blames the wrong env. Move the assignment into the per-group loop. Replace:

```ts
    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [],
      entry: [],
      development: context.dev,
      metaData: {
        initiator: `${GENERATE_ENV_TEMPLATE_TASK_NAME} task`,
        envId: context.id,
        isEnvTemplate: true,
      },
    });

    const bundlerResults = await mapSeries(Object.entries(groups), async ([, targetsGroup]) => {
      bundlerContext.targets = targetsGroup.targets;
```

with:

```ts
    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [],
      entry: [],
      development: context.dev,
      metaData: {
        initiator: `${GENERATE_ENV_TEMPLATE_TASK_NAME} task`,
        envId: context.id,
        isEnvTemplate: true,
      },
    });

    const bundlerResults = await mapSeries(Object.entries(groups), async ([groupEnvId, targetsGroup]) => {
      bundlerContext.targets = targetsGroup.targets;
      // attribute the bundler run to the env that actually supplies the bundler for this group —
      // previously this reported the build-context env, which misled a production OOM investigation
      // into blaming an env that had already migrated its own bundler.
      bundlerContext.metaData!.envId =
        groupEnvId === 'default' ? 'teambit.envs/env (default template bundler)' : groupEnvId;
```

- [ ] **Step 3: Compile and lint**

Run: `bit compile teambit.preview/preview && npm run lint`
Expected: compile success, `Found 0 warnings and 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add scopes/preview/preview/env-preview-template.task.ts
git commit -m "feat(preview): log template-bundler group routing; attribute bundler runs to the bundler-owning env

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Add the rspack-bundler dependency

**Files:**

- Modify: `workspace.jsonc` (the `teambit.dependencies/dependency-resolver` → `policy` → `dependencies` map — same block that holds `"@teambit/harmony.envs.core-aspect-env"`)

**Interfaces:**

- Produces: resolvable package `@teambit/rspack.rspack-bundler@1.0.10` exposing `RspackBundler` with `static create(options: { name?: string; targets: Target[]; transformers: RspackConfigTransformer[]; bundlerContext: BundlerContext; rspackModulePath?: string }, ctx: { logger: Logger }): RspackBundler` (implements `Bundler` from `@teambit/bundler`). Task 3 consumes exactly this.

- [ ] **Step 1: Add the policy entry**

In `workspace.jsonc`, in the dependency policy `dependencies` map (keep alphabetical ordering with its neighbors):

```jsonc
        "@teambit/rspack.modules.rspack-config-mutator": "1.0.23",
        "@teambit/rspack.rspack-bundler": "1.0.10",
```

(The config-mutator is `rspack-bundler`'s typed transformer peer; pinning both keeps resolution deterministic.)

- [ ] **Step 2: Install**

Run: `bit install`
Expected: completes without peer errors; `node -e "console.log(require.resolve('@teambit/rspack.rspack-bundler'))"` prints a path under `node_modules`.

- [ ] **Step 3: Commit**

```bash
git add workspace.jsonc pnpm-lock.yaml
git commit -m "chore(deps): add @teambit/rspack.rspack-bundler + rspack-config-mutator (composed from teambit.rspack)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `createTemplateRspackBundler` + default-path swap

**Files:**

- Modify: `scopes/react/react/react.env.ts` (add method near `createTemplateWebpackBundler`, line ~405)
- Modify: `scopes/harmony/aspect/aspect.env.ts` (`getTemplateBundler`, lines ~141-150)

**Interfaces:**

- Consumes: `RspackBundler.create` (Task 2's Produces), `this.logger` (`Logger`, `react.env.ts:139`), `BundlerContext`/`Bundler` types already imported in both files.
- Produces: `ReactEnv.createTemplateRspackBundler(context: BundlerContext): Bundler` — the method `aspect.env.ts` (and later phases) call.

- [ ] **Step 1: Add the method to `ReactEnv`**

In `scopes/react/react/react.env.ts`, add the import at the top (value import — the class is used at runtime):

```ts
import { RspackBundler } from '@teambit/rspack.rspack-bundler';
```

and next to `createTemplateWebpackBundler` (line ~405):

```ts
  /**
   * default template bundler for env-template generation, composed from the published
   * teambit.rspack building blocks (see docs/superpowers/specs/2026-08-12-rspack-migration-design.md).
   * webpack's createTemplateWebpackBundler stays available as the opt-in escape hatch; note the two
   * are NOT config-compatible — WebpackConfigTransformer functions do not apply here, which is why
   * this method deliberately takes no transformers parameter (rspack-bundler applies its own
   * internal template config via its configFactory).
   */
  createTemplateRspackBundler(context: BundlerContext): Bundler {
    return RspackBundler.create(
      { targets: context.targets, transformers: [], bundlerContext: context },
      { logger: this.logger }
    );
  }
```

If TypeScript complains that `RspackBundler.create`'s `Logger` nominal type differs from this repo's `Logger` (two copies of `@teambit/logger` types), cast the context argument: `{ logger: this.logger } as Parameters<typeof RspackBundler.create>[1]` — and note it; do NOT restructure logging for this.

- [ ] **Step 2: Point the default chain at it**

In `scopes/harmony/aspect/aspect.env.ts` replace:

```ts
  async getTemplateBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    return this.createTemplateWebpackBundler(context, transformers);
  }
```

with:

```ts
  async getTemplateBundler(context: BundlerContext): Promise<Bundler> {
    // rspack by default (phase 1 of the rspack migration — see
    // docs/superpowers/specs/2026-08-12-rspack-migration-design.md). createTemplateWebpackBundler
    // below remains the opt-in escape hatch for envs that need webpack-only behavior.
    return this.reactEnv.createTemplateRspackBundler(context);
  }
```

Keep `createTemplateWebpackBundler` (lines ~145-150) untouched. If the removed `transformers` parameter breaks a caller, the compiler will say so — the only in-repo caller is `env-preview-template.task.ts:117`, which passes no transformers.

- [ ] **Step 3: Compile and lint**

Run: `bit compile teambit.react/react teambit.harmony/aspect && npm run lint`
Expected: compile success, 0 errors. If `@teambit/webpack`'s `WebpackConfigTransformer` import becomes unused in `aspect.env.ts`, remove just that import specifier.

- [ ] **Step 4: Commit**

```bash
git add scopes/react/react/react.env.ts scopes/harmony/aspect/aspect.env.ts
git commit -m "feat(envs): default env-template bundler runs rspack, composed from teambit.rspack

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Local integration verification

**Files:** none modified — verification only.

**Interfaces:**

- Consumes: everything above; the workspace-built bit (`node <repo>/node_modules/@teambit/bit/dist/app.js`, requires a full compile).

- [ ] **Step 1: Full compile (workspace bit must run OUR code, not the released binary)**

Run: `bit compile`
Expected: all components compile. (The released global `bit` must NOT be used for the verification run — it doesn't contain these changes.)

- [ ] **Step 2: Build a small component and watch the template task**

Run: `node node_modules/@teambit/bit/dist/app.js build teambit.harmony/bit-error --log debug 2>&1 | tee /tmp/rspack-phase1-build.log | grep -E "GenerateEnvTemplate|running .* bundler|routed to template-bundler group"`
Expected:

- routing debug lines listing each env and its group (this is the Phase-2 gate data — copy them into the PR description),
- `running Rspack bundler` (NOT `running Webpack bundler`) initiated by the GenerateEnvTemplate task,
- the build completes successfully.

If the build fails inside the rspack run, capture the error block from `/tmp/rspack-phase1-build.log` — the likely gaps are peer/externals or html-config handling differences; STOP and surface the error rather than patching around it (the config work belongs in `rspack-bundler`'s options, not in ad-hoc transformers).

- [ ] **Step 3: Verify the artifact shape is unchanged**

The env-template artifacts must land where consumers expect (`artifacts/env-template` in the env capsule — the `EnvEnv.getNpmIgnore` un-ignore depends on this exact path). Run:

`find ~/Library/Caches/Bit/capsules -maxdepth 4 -type d -name "env-template" -newer /tmp/rspack-phase1-build.log | head -3`

Expected: at least one freshly-written `artifacts/env-template` directory; it contains `index.html` and JS chunks.

- [ ] **Step 4: Commit the plan checkboxes (no code)**

```bash
git add docs/superpowers/plans/2026-08-12-rspack-phase1-template-bundler.md
git commit -m "docs: check off rspack phase-1 local verification

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: CI verification (PR + memory gate)

**Files:** none in this repo's checkout — CI operations.

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin rspack-migration
gh pr create --repo teambit/bit --head rspack-migration \
  --title "feat(envs): rspack as the default env-template bundler (migration phase 1)" \
  --body-file <body written from the spec's Phase-1 section + the routing log evidence from Task 4>
```

- [ ] **Step 2: Confirm the full-suite CI run is green and bundles with rspack**

Watch the PR's `build_and_test`. In the `bit_pr` job output, confirm `running Rspack bundler` appears for the GenerateEnvTemplate task and the job succeeds. e2e_test must be fully green (previews and env templates are exercised across the suite).

- [ ] **Step 3: The memory gate — cascade on 8GB**

Re-run the calibrated experiment: branch `rspack-loadtest-large` off `rspack-migration`, set `bit_pr` to `resource_class: large` + `NODE_OPTIONS: --max-old-space-size=6144` (both places in the job), append a comment line to `scopes/component/component/component.ts`, `bit compile teambit.component/component`, push, open a draft PR titled "DO NOT MERGE: rspack phase-1 memory gate". Webpack OOM-killed this exact scenario at minute 16; rspack passing on 8GB is the phase's success metric (and unblocks the CI dynamic-sizing large tier for env-touching lanes). Record the outcome (duration, credits, OOM or not) in the phase-1 PR, then close the draft PR and delete its branch.

---

## Self-review notes

- Spec coverage: Phase 1 items (template bundler swap ✓ Task 3; attribution fix ✓ Task 1; artifact-shape compatibility ✓ Task 4 Step 3) and Phase 2's verify-first diagnostic (✓ Task 1 Step 1 + Task 4 Step 2 evidence). Verification gates 1-3 from the spec map to Task 5; gate 4 (visual smoke on bit.cloud) happens post-merge on a real component — noted for the PR checklist.
- Types: `RspackBundler.create` signature transcribed from `teambit.rspack/rspack-bundler@1.0.10` source (`rspack-bundler.ts`): `create(options, { logger })`, `options.transformers` must be an array (it is spread unconditionally).
- The `getTemplateBundler` signature change (dropping `transformers`) is safe: the interface (`scopes/envs/envs/environment.ts:175`) declares `transformers?: any[]` optional, and the only caller passes none.
