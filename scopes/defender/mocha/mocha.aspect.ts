import { Aspect } from '../../harmony/harmony/aspect';

export const MochaAspect = Aspect.create({
  id: 'teambit.defender/mocha',
  runtimes: { main: () => import('./mocha.main.runtime') },
});
