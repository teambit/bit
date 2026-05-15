import { Aspect } from '@teambit/core';

export const APIReferenceAspect = Aspect.create({
  id: 'teambit.api-reference/api-reference',
  runtimes: { ui: () => import('./api-reference.ui.runtime') },
});

export default APIReferenceAspect;
