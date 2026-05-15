import { Aspect } from '@teambit/core';

export const CompilerAspect = Aspect.create({
  id: 'teambit.compilation/compiler',
  runtimes: { main: () => import('./compiler.main.runtime') },
  commands: () => import('./compiler.commands').then((m) => [m.compileCommand]),
});
