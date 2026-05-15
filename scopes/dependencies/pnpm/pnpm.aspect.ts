import { Aspect } from '@teambit/core';

export const PnpmAspect = Aspect.create({
  id: 'teambit.dependencies/pnpm',
  runtimes: { main: () => import('./pnpm.main.runtime') },
});

export default PnpmAspect;
