import { ReactWorkspaceStarter } from '@bitdev/react.generators.react-starters';
import type { EnvContext } from '@teambit/envs';
import type { WorkspaceTemplate } from '@teambit/generator';
import { StarterList } from '@teambit/generator';

const starterListHandler = StarterList.from([ReactWorkspaceStarter.from({ env: 'bitdev.react/react-env' })]);

export function getStarters(envContext: EnvContext): WorkspaceTemplate[] {
  const starterList = starterListHandler(envContext);
  return starterList.compute();
}
