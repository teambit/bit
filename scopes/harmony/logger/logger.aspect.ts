import { Aspect } from '@teambit/core';

export const LoggerAspect = Aspect.create({
  id: 'teambit.harmony/logger',
  runtimes: { main: () => import('./logger.main.runtime') },
});
