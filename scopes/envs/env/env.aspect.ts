import { Aspect } from '@teambit/core';

export const EnvAspect = Aspect.create({
  id: 'teambit.envs/env',
  runtimes: { main: () => import('./env.main.runtime') },
});
