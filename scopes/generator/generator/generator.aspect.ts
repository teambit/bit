import { Aspect } from '@teambit/core';

export const GeneratorAspect = Aspect.create({
  id: 'teambit.generator/generator',
  runtimes: { main: () => import('./generator.main.runtime') },
});
