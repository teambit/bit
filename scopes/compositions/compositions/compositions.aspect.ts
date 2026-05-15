import { Aspect } from '@teambit/core';

export const CompositionsAspect = Aspect.create({
  id: 'teambit.compositions/compositions',
  runtimes: { main: () => import('./compositions.main.runtime') },
});

export default CompositionsAspect;
