import { RuntimeDefinition } from '@teambit/harmony';
import { Aspect } from '@teambit/core';

export const ConfigRuntime = new RuntimeDefinition('main');

export const ConfigAspect = Aspect.create({
  id: 'teambit.harmony/config',
  runtimes: { main: () => import('./config.main.runtime') },
});
