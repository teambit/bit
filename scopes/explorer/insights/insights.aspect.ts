import { Aspect } from '@teambit/core';

export const InsightsAspect = Aspect.create({
  id: 'teambit.explorer/insights',
  runtimes: { main: () => import('./insights.main.runtime') },
});
