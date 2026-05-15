import { Aspect } from '../harmony/aspect';

export const IpcEventsAspect = Aspect.create({
  id: 'teambit.harmony/ipc-events',
  runtimes: { main: () => import('./ipc-events.main.runtime') },
});
