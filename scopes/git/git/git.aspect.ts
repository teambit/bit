import { Aspect } from '../../harmony/harmony/aspect';

export const GitAspect = Aspect.create({
  id: 'teambit.git/git',
  runtimes: { main: () => import('./git.main.runtime') },
});
