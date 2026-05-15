import { Aspect } from '@teambit/core';

export const TypescriptAspect = Aspect.create({
  id: 'teambit.typescript/typescript',
  runtimes: { main: () => import('./typescript.main.runtime') },
});
