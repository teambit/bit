import { Aspect } from '../harmony/aspect';

export const ExpressAspect = Aspect.create({
  id: 'teambit.harmony/express',
  runtimes: { main: () => import('./express.main.runtime') },
});
