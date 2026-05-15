import { Aspect } from '../../harmony/harmony/aspect';

export const LessAspect = Aspect.create({
  id: 'teambit.ui-foundation/less',
  runtimes: { main: () => import('./less.main.runtime') },
});
