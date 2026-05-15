import { Aspect } from '@teambit/core';

export const WorkspaceAspect = Aspect.create({
  id: 'teambit.workspace/workspace',
  runtimes: { main: () => import('./workspace.main.runtime') },
});

export default WorkspaceAspect;
