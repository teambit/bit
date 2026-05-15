import { Aspect } from '@teambit/core';

export const UserAgentAspect = Aspect.create({
  id: 'teambit.ui-foundation/user-agent',
  runtimes: { ui: () => import('./user-agent.ui.runtime') },
});

export default UserAgentAspect;
