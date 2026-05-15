import { Aspect } from '@teambit/core';

export const MultiCompilerAspect = Aspect.create({
  id: 'teambit.compilation/multi-compiler',
  runtimes: { main: () => import('./multi-compiler.main.runtime') },
});
