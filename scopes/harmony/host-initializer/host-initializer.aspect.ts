import { Aspect } from '../harmony/aspect';

export const HostInitializerAspect = Aspect.create({
  id: 'teambit.harmony/host-initializer',
  runtimes: { main: () => import('./host-initializer.main.runtime') },
});
