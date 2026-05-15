import { Aspect } from '@teambit/core';

export const GitAspect = Aspect.create({
  id: 'teambit.git/git',
  runtimes: { main: () => import('./git.main.runtime') },
});
