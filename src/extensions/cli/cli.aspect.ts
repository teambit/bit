import { Aspect, RuntimeDefinition } from '../aspect';
import { DummyAspect } from '../dummy/dummy.aspect';

export const CLIRuntime = new RuntimeDefinition('cli', [DummyAspect]);

export const CLIAspect = Aspect.create({
  id: '@teambit/cli',
  dependencies: [],
  declareRuntime: CLIRuntime,
});
