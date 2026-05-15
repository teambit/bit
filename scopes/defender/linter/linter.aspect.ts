import { Aspect } from '@teambit/core';

export const LinterAspect = Aspect.create({
  id: 'teambit.defender/linter',
  runtimes: { main: () => import('./linter.main.runtime') },
  commands: () => import('./linter.commands').then((m) => [m.lintCommand]),
});
