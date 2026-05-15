import { Aspect } from '@teambit/core';

export const ChangelogAspect = Aspect.create({
  id: 'teambit.component/changelog',
  runtimes: { ui: () => import('./changelog.ui.runtime') },
});

export default ChangelogAspect;
