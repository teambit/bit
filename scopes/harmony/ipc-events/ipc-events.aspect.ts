import { Aspect } from '@teambit/core';

export const IpcEventsAspect = Aspect.create({
  id: 'teambit.harmony/ipc-events',
  runtimes: { main: () => import('./ipc-events.main.runtime') },
});
