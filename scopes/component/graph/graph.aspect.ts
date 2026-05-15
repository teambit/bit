import { Aspect } from '../../harmony/harmony/aspect';

export const GraphAspect = Aspect.create({
  id: 'teambit.component/graph',
  runtimes: { main: () => import('./graph.main.runtime') },
  commands: () => import('./graph.commands').then((m) => [m.graphCommand]),
});

export default GraphAspect;
