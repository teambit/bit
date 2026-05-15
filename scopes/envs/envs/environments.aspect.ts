import { Aspect } from '../../harmony/harmony/aspect';

export const EnvsAspect = Aspect.create({
  id: 'teambit.envs/envs',
  runtimes: { main: () => import('./environments.main.runtime') },
});
