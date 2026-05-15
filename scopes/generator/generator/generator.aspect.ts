import { Aspect } from '../../harmony/harmony/aspect';

export const GeneratorAspect = Aspect.create({
  id: 'teambit.generator/generator',
  runtimes: { main: () => import('./generator.main.runtime') },
});
