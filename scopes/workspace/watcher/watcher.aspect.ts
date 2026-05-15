import { Aspect } from '@teambit/core';

export const WatcherAspect = Aspect.create({
  id: 'teambit.workspace/watcher',
  runtimes: { main: () => import('./watcher.main.runtime') },
});
