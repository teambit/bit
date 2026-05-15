import { Aspect } from '@teambit/core';

export const ConfigStoreAspect = Aspect.create({
  id: 'teambit.harmony/config-store',
  runtimes: { main: () => import('./config-store.main.runtime') },
  commands: () => import('./config-store.commands').then((m) => [m.configCommand]),
});
