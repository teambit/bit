import { Aspect } from '@teambit/core';

export const DiagnosticAspect = Aspect.create({
  id: 'teambit.harmony/diagnostic',
  runtimes: { main: () => import('./diagnostic.main.runtime') },
});
