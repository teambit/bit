import { Aspect } from '@teambit/core';

export const ReadmeAspect = Aspect.create({
  id: 'teambit.mdx/readme',
  runtimes: { main: () => import('./readme.main.runtime') },
});
