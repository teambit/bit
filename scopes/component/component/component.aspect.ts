import { Aspect } from '@teambit/core';

export const ComponentAspect = Aspect.create({
  id: 'teambit.component/component',
  runtimes: { main: () => import('./component.main.runtime') },
});

export default ComponentAspect;
