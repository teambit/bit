import { Aspect } from '../../harmony/harmony/aspect';

export const MDXAspect = Aspect.create({
  id: 'teambit.mdx/mdx',
  runtimes: { main: () => import('./mdx.main.runtime') },
});

export default MDXAspect;
