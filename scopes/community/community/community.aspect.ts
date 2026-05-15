import { Aspect } from '../../harmony/harmony/aspect';

export const CommunityAspect = Aspect.create({
  id: 'teambit.community/community',
  runtimes: { main: () => import('./community.main.runtime') },
});
