import { Aspect } from '../../harmony/harmony/aspect';

export const CiAspect = Aspect.create({
  id: 'teambit.git/ci',
  runtimes: { main: () => import('./ci.main.runtime') },
});

export default CiAspect;
