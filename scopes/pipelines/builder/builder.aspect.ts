import { Aspect } from '@teambit/core';

export const BuilderAspect = Aspect.create({
  id: 'teambit.pipelines/builder',
  runtimes: { main: () => import('./builder.main.runtime') },
});
