import { Aspect } from '@teambit/core';

export const YarnAspect = Aspect.create({
  id: 'teambit.dependencies/yarn',
  runtimes: { main: () => import('./yarn.main.runtime') },
});

export default YarnAspect;
