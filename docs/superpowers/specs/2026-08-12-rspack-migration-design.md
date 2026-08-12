# Rspack Migration — Design

**Date**: 2026-08-12
**Status**: Approved (design); implementation planned separately
**Owner**: CI/cost + build-infra effort (grew out of the bit_pr OOM investigation)

## Goal

Every bundling path bit ships runs rspack by default — env template generation
(`GenerateEnvTemplate`), component preview builds (`GeneratePreview`), the preview dev server
(`bit start`), and the react app-type — by **composing the existing granular components from the
`teambit.rspack` scope**. Webpack remains available as an explicit opt-in for envs that need it,
not as a default. No new "core" rspack aspect is created in this repo; the migration also
dismantles core-env special-casing where it forces webpack (we are moving away from the core-envs
concept generally).

## Verified current state (2026-08-12)

- **Already rspack** (in this repo): bit's own UI — `bit start` server, `BundleUI`, SSR
  (`scopes/ui-foundation/ui/rspack/*`, `ui.main.runtime.ts`), and preview pre-bundle
  (`scopes/preview/preview/rspack/rspack.config.ts`).
- **Already rspack** (external): the envs generation — `teambit.harmony/envs/core-aspect-env@2.0.6`
  `preview()` returns `ReactPreview` from `@teambit/rspack.dev-services.preview.react-preview`,
  whose `getDevServer`/`getBundler`/`getTemplateBundler` are all rspack.
- **Complete reference stack exists** in the `teambit.rspack` scope: `rspack-bundler@1.0.10`,
  `rspack-dev-server@0.1.50`, `modules/rspack-config-mutator@1.0.23`,
  `dev-services/preview/react-preview@1.0.15`, plus full envs (`envs/bit-env@1.0.11`,
  `envs/react-env`, `envs/node-env`, `envs/mdx-env`) and `app-types/react-rspack@1.0.18`.
- **Still webpack** (the migration surface, all in this repo):
  1. The **default env-template bundler**: `env-preview-template.task.ts` forces core envs into a
     "default" group (`shouldUseDefaultBundler`, line ~127) whose bundler comes from
     `teambit.envs/env` → `aspect.env.ts:141 getTemplateBundler` →
     `reactEnv.createTemplateWebpackBundler()`. This is what OOM-killed `bit_pr` on an 8GB
     machine (measured: 98-component cascade, died in `GenerateEnvTemplate`'s webpack run;
     passed on 16GB).
  2. Classic in-repo envs (`scopes/react/react`, `scopes/harmony/aspect`, html, mdx, node):
     `getBundler`/`getDevServer`/preview wiring via `@teambit/webpack`.
  3. React app-type (`scopes/react/react/apps/web`) and `scopes/webpack/module-federation`.
- **Known attribution bug**: the bundler log line reports `metaData.envId = context.id` (the
  build-context env), not the env that actually supplied the bundler — CI logs claimed
  `core-aspect-env` created a webpack config when the webpack config came from the forced
  default group.

## Design principle

**Composition over porting.** Consumers in this repo add component dependencies on the granular
`teambit.rspack` pieces they need — the same pattern `core-aspect-env` already uses. Envs keep
their identities (no consumer is switched to `teambit.rspack/envs/*`; those are reference
implementations). Some `teambit.webpack` utility modules legitimately remain as shared code
(e.g. `rspack-config-mutator` itself depends on `teambit.webpack/modules/generate-externals`).

## Phases

Each phase is independently shippable and gated (see Verification).

### Phase 1 — default template bundler (choke point; kills the CI OOM class)

- Add a `createTemplateRspackBundler` path composed from `@teambit/rspack.rspack-bundler` (+
  `rspack-config-mutator` where transformation is needed), and use it where
  `createTemplateWebpackBundler` is used today: `aspect.env.ts getTemplateBundler` (the
  `teambit.envs/env` default) and the react env's template path.
- Fix the `metaData.envId` attribution so the log names the bundler-owning env.
- User-facing surface: none by design — the default template bundler is internal to the build;
  env authors do not configure it directly. Env-template artifacts must remain
  consumption-compatible (same artifact names/layout under `artifacts/env-template`).

### Phase 2 — de-special-case template-bundler routing

- `shouldUseDefaultBundler` stops forcing core envs onto the default group. Any env whose
  preview supplies a template bundler uses its own; the default group remains only as a fallback
  for envs without one (now rspack-backed after Phase 1).
- **Open question resolved first** (step 1 of implementation): why `core-aspect-env` — not a
  core aspect id — landed in the default group in our CI build. Either `isCoreEnv` matches it,
  or new-gen env handlers don't surface `getTemplateBundler` on the legacy env interface (line
  ~129 check). The answer decides whether the fix is in the routing check or in the env-handler
  → legacy-interface adapter. Verify empirically (debug logging on a cascade build) before
  changing routing.
- Grouping stays: envs sharing a bundler still bundle in one run (efficiency), only the forced
  membership goes away.

### Phase 3 — classic in-repo envs (GeneratePreview + bit start)

- `scopes/react/react` (and via it aspect/html/mdx/node): `getBundler`, `getDevServer`, and
  preview wiring compose `rspack-bundler`, `rspack-dev-server`,
  `dev-services/preview/react-preview` (where the whole preview service fits), and
  `rspack-config-mutator`.
- **Compat policy for user envs** extending classic envs with `WebpackConfigTransformer`s:
  - rspack's configuration schema is intentionally webpack-compatible and
    `rspack-config-mutator` mirrors the webpack mutator API; ship an adapter that applies
    existing webpack transformers to the rspack config mutator where schema-compatible.
  - Envs using webpack-only plugins/loaders keep working via the escape hatch: explicitly
    compose `@teambit/webpack` (it remains a published aspect) — documented in the changelog
    with a migration note.
  - The adapter logs (once, with the transformer name) when a transformer touches
    webpack-only fields it cannot translate, so breakage is diagnosable, not silent.

### Phase 4 — react app-type + module federation

- Migrate `scopes/react/react/apps/web` following `teambit.rspack/app-types/react-rspack`
  (bundler + dev server + asset manifest via `modules/generate-asset-manifest`).
- Replace `scopes/webpack/module-federation` usage with rspack's native module federation.
- After this phase, `@teambit/webpack` is no longer a dependency of any default env/app-type —
  it remains published for opt-in use.

## Verification (every phase)

1. Full e2e suite green (the repo's e2e covers preview/env-template/app flows).
2. A full-cascade `bit_pr` build green (comment-touch on `teambit.component/component`, ~98
   components — the calibrated loadtest method), with the log showing `running Rspack bundler`
   for the migrated path.
3. **Memory/wall-time measured** with the same loadtest on `large` (8GB): webpack's
   GenerateEnvTemplate OOM-killed it; rspack passing there is the objective win metric (and
   unlocks the cheaper CI tier for the median PR — see the dynamic machine-sizing effort).
4. Preview artifacts spot-checked: env-template and component preview render in `bit start` and
   on bit.cloud for a migrated env (visual smoke, not just green tasks).

## Rollout

- External env components version normally; consumers adopt at their own pace.
- In-repo aspects/envs ride the bit release train: changelog entry per phase, webpack escape
  hatch documented from Phase 3 on.
- No feature flags: phases are small enough to revert by version, and each is independently
  shippable.

## Risks

- **Plugin/loader parity**: html injection, externals generation, CSS/SCSS pipeline, MDX loader
  chains. Mitigation: the `teambit.rspack` stack already solves these for its envs (mdx
  pre-loader, inject-html-element, generate-asset-manifest); compose, don't reinvent.
- **Transformer compat gaps** (Phase 3): adapter + escape hatch + diagnosable logging, above.
- **ESM/CJS interop**: the rspack scope leans ESM (`envs/bit-env` sets `type: module`), this
  repo is largely CJS. `ui-foundation` already `require`s `@rspack/core` successfully; the
  bundler/dev-server components are consumed as packages, so interop is a per-import check, not
  an architectural blocker.
- **Behavioral drift in bundles** (chunking, hashing, source maps): preview artifacts are
  regenerated per build, not diffed against old ones; risk is limited to consumer-visible
  rendering, covered by verification #4.

## Explicitly out of scope

- Migrating consumers to `teambit.rspack/envs/*` (those remain references).
- Deleting the `teambit.webpack` scope or the in-repo webpack aspect (stays as opt-in).
- Vue/Angular env bundling (separate ownership; same recipe applies later).
