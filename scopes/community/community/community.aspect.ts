import { Aspect } from '@teambit/core';

export const CommunityAspect = Aspect.create({
  id: 'teambit.community/community',
  runtimes: { main: () => import('./community.main.runtime') },
});
