import { Aspect } from '@teambit/core';

export const CloudAspect = Aspect.create({
  id: 'teambit.cloud/cloud',
  runtimes: { main: () => import('./cloud.main.runtime') },
});

export default CloudAspect;
