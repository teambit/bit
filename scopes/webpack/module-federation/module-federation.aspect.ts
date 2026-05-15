import { Aspect } from '../../harmony/harmony/aspect';

export const ModuleFederationAspect = Aspect.create({
  id: 'teambit.webpack/module-federation',
  runtimes: { main: () => import('./module-federation.main.runtime') },
});
