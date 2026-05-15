import { Aspect } from '../../harmony/harmony/aspect';

export const VariantsAspect = Aspect.create({
  id: 'teambit.workspace/variants',
  runtimes: { main: () => import('./variants.main.runtime') },
});
