import { Aspect } from '../../harmony/harmony/aspect';

export const JestAspect = Aspect.create({
  id: 'teambit.defender/jest',
  runtimes: { main: () => import('./jest.main.runtime') },
});
