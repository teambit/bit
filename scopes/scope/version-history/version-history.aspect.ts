import { Aspect } from '@teambit/core';

export const VersionHistoryAspect = Aspect.create({
  id: 'teambit.scope/version-history',
  runtimes: { main: () => import('./version-history.main.runtime') },
  commands: () => import('./version-history.commands').then((m) => [m.catVersionHistoryCommand]),
});
