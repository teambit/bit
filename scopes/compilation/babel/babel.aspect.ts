import { Aspect } from '../../harmony/harmony/aspect';

export const BabelAspect = Aspect.create({
  id: 'teambit.compilation/babel',
  runtimes: { main: () => import('./babel.main.runtime') },
});
