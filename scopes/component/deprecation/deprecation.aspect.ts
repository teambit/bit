import { Aspect } from '@teambit/core';

export const DeprecationAspect = Aspect.create({
  id: 'teambit.component/deprecation',
  runtimes: { main: () => import('./deprecation.main.runtime') },
  commands: () => import('./deprecation.commands').then((m) => [m.deprecateCommand, m.undeprecateCommand]),
});

export default DeprecationAspect;
