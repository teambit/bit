import { Aspect } from '../../harmony/harmony/aspect';

export const ScopeAspect = Aspect.create({
  id: 'teambit.scope/scope',
  runtimes: {
    main: () => import('./scope.main.runtime'),
    ui: () => import('./scope.ui.runtime'),
  },
});

export default ScopeAspect;
