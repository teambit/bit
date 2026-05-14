import { Aspect } from '../harmony/aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';

export const ScopeAspect = Aspect.create({
  id: 'teambit.scope/scope',
  dependencies: [LoggerAspect],
  runtimes: {
    main: () => import('./scope.main.runtime.js'),
  },
});

export default ScopeAspect;
