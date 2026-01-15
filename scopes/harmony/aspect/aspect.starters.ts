import { HarmonyWorkspaceStarter } from '@bitdev/symphony.generators.symphony-starters';
import type { EnvContext } from '@teambit/envs';
import type { WorkspaceTemplate } from '@teambit/generator';
import { StarterList } from '@teambit/generator';

export function getStarters(envContext: EnvContext): WorkspaceTemplate[] {
  const starterListHandler = StarterList.from([HarmonyWorkspaceStarter.from({ env: 'bitdev.symphony/symphony-env' })]);
  const starterList = starterListHandler(envContext);
  return starterList.compute();
}
