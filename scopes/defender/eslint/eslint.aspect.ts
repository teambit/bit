import { Aspect } from '@teambit/core';

export const ESLintAspect = Aspect.create({
  id: 'teambit.defender/eslint',
  runtimes: { main: () => import('./eslint.main.runtime') },
});
