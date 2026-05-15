import { Aspect } from '@teambit/core';

export const ComponentTreeAspect = Aspect.create({
  id: 'teambit.component/component-tree',
  runtimes: { ui: () => import('./component-tree.ui.runtime') },
});

export default ComponentTreeAspect;
