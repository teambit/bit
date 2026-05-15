import { Aspect } from '../../harmony/harmony/aspect';

export const ESLintAspect = Aspect.create({
  id: 'teambit.defender/eslint',
  runtimes: { main: () => import('./eslint.main.runtime') },
});
