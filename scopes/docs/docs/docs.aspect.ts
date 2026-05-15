import { Aspect } from '../../harmony/harmony/aspect';

export const DocsAspect = Aspect.create({
  id: 'teambit.docs/docs',
  runtimes: { main: () => import('./docs.main.runtime') },
});

export default DocsAspect;
