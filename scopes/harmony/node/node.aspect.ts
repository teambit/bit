import { Aspect } from '../harmony/aspect';

export const NodeAspect = Aspect.create({
  id: 'teambit.harmony/node',
  runtimes: { main: () => import('./node.main.runtime') },
});

export default NodeAspect;
