import { Aspect } from '../../harmony/harmony/aspect';

export const InsightsAspect = Aspect.create({
  id: 'teambit.explorer/insights',
  runtimes: { main: () => import('./insights.main.runtime') },
});
