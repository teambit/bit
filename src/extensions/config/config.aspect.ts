import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const MainRuntime = new RuntimeDefinition('main');

export const ConfigAspect = Aspect.create({
  id: '@teambit/config',
  dependencies: [],
  declareRuntime: MainRuntime,
});
