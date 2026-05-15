import { Aspect } from '../../harmony/harmony/aspect';

export const ReadmeAspect = Aspect.create({
  id: 'teambit.mdx/readme',
  runtimes: { main: () => import('./readme.main.runtime') },
});
