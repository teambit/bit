import { Aspect } from '../../harmony/harmony/aspect';

export const StashAspect = Aspect.create({
  id: 'teambit.component/stash',
  runtimes: { main: () => import('./stash.main.runtime') },
});
