import { Aspect } from '@teambit/harmony';
import { MainRuntime } from '@teambit/harmony.modules.runtimes';

export const ConfigRuntime = MainRuntime;

export const ConfigAspect = Aspect.create({
  id: 'teambit.harmony/config',
  dependencies: [],
  declareRuntime: ConfigRuntime,
});
