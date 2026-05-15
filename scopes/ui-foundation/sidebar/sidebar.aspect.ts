import { Aspect } from '@teambit/core';

export const SidebarAspect = Aspect.create({
  id: 'teambit.ui-foundation/sidebar',
  runtimes: { ui: () => import('./sidebar.ui.runtime') },
});

export default SidebarAspect;
