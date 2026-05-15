import { Aspect } from '@teambit/core';

export const EnvsAspect = Aspect.create({
  id: 'teambit.envs/envs',
  runtimes: { main: () => import('./environments.main.runtime') },
});
