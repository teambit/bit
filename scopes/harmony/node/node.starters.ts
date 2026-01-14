import { NodeWorkspaceStarter } from '@bitdev/node.generators.node-starters';
import type { EnvContext } from '@teambit/envs';
import type { WorkspaceTemplate } from '@teambit/generator';
import { StarterList } from '@teambit/generator';

const starterListHandler = StarterList.from([NodeWorkspaceStarter.from({ env: 'bitdev.node/node-env' })]);

export function getStarters(envContext: EnvContext): WorkspaceTemplate[] {
  const starterList = starterListHandler(envContext);
  return starterList.compute();
}
