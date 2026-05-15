import { Aspect } from '../../harmony/harmony/aspect';

export const YarnAspect = Aspect.create({
  id: 'teambit.dependencies/yarn',
  runtimes: { main: () => import('./yarn.main.runtime') },
});

export default YarnAspect;
