import { Aspect } from '@teambit/core';

export const ExportAspect = Aspect.create({
  id: 'teambit.scope/export',
  runtimes: { main: () => import('./export.main.runtime') },
  commands: () => import('./export.commands').then((m) => [m.resumeExportCommand, m.exportCommand]),
});
