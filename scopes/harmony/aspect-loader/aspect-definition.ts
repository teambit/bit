import type { AspectDefinition } from '@teambit/component';

export { AspectDefinition } from '@teambit/component';
export type { AspectDefinitionProps } from '@teambit/component';

/**
 * keep only the aspects that ship *inside* bit, dropping the ones the surrounding workspace
 * contributes (envs and workspace-configured aspects).
 *
 * a core aspect is resolved from bit's own installation and carries no `component`, so its
 * `getId` is a bare `teambit.x/y`. anything the workspace adds resolves as a component and is
 * versioned - `teambit.react/react@1.0.1042`.
 *
 * this matters when *building* a pre-bundle: the artifact has to describe bit, not the workspace it
 * happened to be built in. bit's own repo uses `teambit.react/react` as an env for some of its
 * components, so an unfiltered list bakes that env - at one specific version - into an artifact
 * every user workspace then fails to match. see `bundle-plan.md` §17.
 */
export function filterCoreAspectDefs(defs: AspectDefinition[]): AspectDefinition[] {
  return defs.filter((def) => !def.component);
}
