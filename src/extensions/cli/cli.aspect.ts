import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const CLIRuntime = new RuntimeDefinition('cli');

export const CLIAspect = Aspect.create({
  id: '@teambit/cli',
  dependencies: [],
  declareRuntime: CLIRuntime,
  files: [require.resolve('./cli.cli')],
});
