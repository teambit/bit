import { Aspect } from '@teambit/core';

export const ComponentWriterAspect = Aspect.create({
  id: 'teambit.component/component-writer',
  runtimes: { main: () => import('./component-writer.main.runtime') },
});
