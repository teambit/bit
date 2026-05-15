import { Aspect } from '../../harmony/harmony/aspect';

export const BundlerAspect = Aspect.create({
  id: 'teambit.compilation/bundler',
  runtimes: { main: () => import('./bundler.main.runtime') },
});
