import { Aspect } from '@teambit/core';

export const NewComponentHelperAspect = Aspect.create({
  id: 'teambit.component/new-component-helper',
  runtimes: { main: () => import('./new-component-helper.main.runtime') },
});
