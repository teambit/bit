import { Aspect } from '@teambit/core';

export const ValidatorAspect = Aspect.create({
  id: 'teambit.defender/validator',
  runtimes: { main: () => import('./validator.main.runtime') },
  commands: () => import('./validator.commands').then((m) => [m.validateCommand]),
});
