import { Aspect } from '../../harmony/harmony/aspect';

export const BuilderAspect = Aspect.create({
  id: 'teambit.pipelines/builder',
  runtimes: { main: () => import('./builder.main.runtime') },
});
