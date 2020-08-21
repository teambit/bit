import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const MainRuntime = new RuntimeDefinition('main');

export const CLIAspect = Aspect.create({
  id: 'teambit.bit/cli',
  dependencies: [],
  declareRuntime: MainRuntime,
});
