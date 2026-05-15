import { Aspect } from '../../harmony/harmony/aspect';

export const EnvAspect = Aspect.create({
  id: 'teambit.envs/env',
  runtimes: { main: () => import('./env.main.runtime') },
});
