import { Aspect } from '@teambit/core';

export const ReactAspect = Aspect.create({
  id: 'teambit.react/react',
  runtimes: { main: () => import('./react.main.runtime') },
});

export default ReactAspect;
