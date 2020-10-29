import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const ConfigRuntime = new RuntimeDefinition('main');

export const ConfigAspect = Aspect.create({
  id: 'teambit.harmony/config',
  dependencies: [],
  declareRuntime: ConfigRuntime,
});
