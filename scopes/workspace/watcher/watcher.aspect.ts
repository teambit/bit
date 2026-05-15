import { Aspect } from '../../harmony/harmony/aspect';

export const WatcherAspect = Aspect.create({
  id: 'teambit.workspace/watcher',
  runtimes: { main: () => import('./watcher.main.runtime') },
});
