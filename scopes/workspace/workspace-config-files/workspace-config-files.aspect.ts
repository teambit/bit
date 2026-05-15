import { Aspect } from '@teambit/core';

export const WorkspaceConfigFilesAspect = Aspect.create({
  id: 'teambit.workspace/workspace-config-files',
  runtimes: { main: () => import('./workspace-config-files.main.runtime') },
});
