import { Aspect } from '@teambit/harmony';
import { MainRuntime } from '@teambit/harmony.modules.runtimes';

export { MainRuntime };

export const CLIAspect = Aspect.create({
  id: 'teambit.harmony/cli',
  dependencies: [],
  declareRuntime: MainRuntime,
});

export default CLIAspect;
