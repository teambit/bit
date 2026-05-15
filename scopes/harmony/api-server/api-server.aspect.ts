import { Aspect } from '@teambit/core';

export const ApiServerAspect = Aspect.create({
  id: 'teambit.harmony/api-server',
  runtimes: { main: () => import('./api-server.main.runtime') },
  commands: () => import('./api-server.commands').then((m) => [m.serverCommand]),
});
