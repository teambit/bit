import { Aspect } from '../../harmony/harmony/aspect';

export const PkgAspect = Aspect.create({
  id: 'teambit.pkg/pkg',
  runtimes: { main: () => import('./pkg.main.runtime') },
});

export default PkgAspect;
