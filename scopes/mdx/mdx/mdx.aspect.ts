import { Aspect } from '@teambit/core';

export const MDXAspect = Aspect.create({
  id: 'teambit.mdx/mdx',
  runtimes: { main: () => import('./mdx.main.runtime') },
});

export default MDXAspect;
