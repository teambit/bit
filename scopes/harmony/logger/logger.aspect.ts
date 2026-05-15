import { Aspect } from '../harmony/aspect';

export const LoggerAspect = Aspect.create({
  id: 'teambit.harmony/logger',
  runtimes: { main: () => import('./logger.main.runtime') },
});
