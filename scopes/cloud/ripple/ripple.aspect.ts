import { Aspect } from '../../harmony/harmony/aspect';

export const RippleAspect = Aspect.create({
  id: 'teambit.cloud/ripple',
  runtimes: { main: () => import('./ripple.main.runtime') },
});

export default RippleAspect;
