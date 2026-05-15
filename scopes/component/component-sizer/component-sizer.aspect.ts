import { Aspect } from '@teambit/core';

export const ComponentSizerAspect = Aspect.create({
  id: 'teambit.component/component-sizer',
  runtimes: { main: () => import('./component-sizer.main.runtime') },
});

export default ComponentSizerAspect;
