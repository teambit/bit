import { Aspect } from '@teambit/core';

export const CodeAspect = Aspect.create({
  id: 'teambit.component/code',
  runtimes: { ui: () => import('./code.ui.runtime') },
});

export default CodeAspect;
