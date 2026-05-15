import { Aspect } from '@teambit/core';

export const ReactRouterAspect = Aspect.create({
  id: 'teambit.ui-foundation/react-router',
  runtimes: { ui: () => import('./react-router.ui.runtime') },
});

export default ReactRouterAspect;
