import { Aspect } from '@teambit/core';

export const ImporterAspect = Aspect.create({
  id: 'teambit.scope/importer',
  runtimes: { main: () => import('./importer.main.runtime') },
  commands: () => import('./importer.commands').then((m) => [m.importCommand, m.fetchCommand]),
});
