import { SymphonyTemplates } from '@bitdev/symphony.generators.symphony-templates';
import { HarmonyWorkspaceStarter } from '@bitdev/symphony.generators.symphony-starters';
import type { EnvContext } from '@teambit/envs';
import type { ComponentTemplate } from './component-template';
import type { WorkspaceTemplate } from './workspace-template';
import { StarterList } from './starter-list';

/**
 * templates and starters for creating harmony workspaces. these were registered by
 * teambit.harmony/aspect when it was a core aspect. they are registered here so "bit new" keeps
 * working out of the box now that the aspect env is a regular env. the "bit-aspect" template lives
 * in teambit.harmony/envs/core-aspect-env and is available via the generator config
 * ("teambit.generator/generator": { "envs": [...] }) or the --env flag.
 */
export function getBuiltinTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = SymphonyTemplates({ symphonyEnvId: 'bitdev.symphony/envs/symphony-env' })(envContext);
  return templateList.compute();
}

export function getBuiltinStarters(envContext: EnvContext): WorkspaceTemplate[] {
  const starterListHandler = StarterList.from([
    HarmonyWorkspaceStarter.from({ env: 'bitdev.symphony/envs/symphony-env' }),
  ]);
  const starterList = starterListHandler(envContext);
  return starterList.compute();
}
