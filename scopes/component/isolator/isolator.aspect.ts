import { Aspect } from '../../harmony/harmony/aspect';

export const IsolatorAspect = Aspect.create({
  id: 'teambit.component/isolator',
  runtimes: { main: () => import('./isolator.main.runtime') },
});
