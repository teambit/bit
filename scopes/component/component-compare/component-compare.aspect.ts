import { Aspect } from '@teambit/core';

export const ComponentCompareAspect = Aspect.create({
  id: 'teambit.component/component-compare',
  runtimes: { main: () => import('./component-compare.main.runtime') },
  commands: () => import('./component-compare.commands').then((m) => [m.diffCommand]),
});

export default ComponentCompareAspect;
