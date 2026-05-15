import { Aspect } from '../../harmony/harmony/aspect';

export const PrettierAspect = Aspect.create({
  id: 'teambit.defender/prettier',
  runtimes: { main: () => import('./prettier.main.runtime') },
});
