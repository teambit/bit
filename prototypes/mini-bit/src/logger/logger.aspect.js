import { Aspect } from '../harmony/aspect.js';

export const LoggerAspect = Aspect.create({
  id: 'teambit.harmony/logger',
  dependencies: [],
  runtimes: {
    main: () => import('./logger.main.runtime.js'),
  },
});

export default LoggerAspect;
