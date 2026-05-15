import { RuntimeDefinition } from '@teambit/harmony';
import { Aspect } from '../harmony/aspect';

export const MainRuntime = new RuntimeDefinition('main');

export const CLIAspect = Aspect.create({
  id: 'teambit.harmony/cli',
  runtimes: { main: () => import('./cli.main.runtime') },
  commands: () => import('./cli.commands').then((m) => [m.completionCommand, m.versionCommand, m.detailsCommand]),
});

export default CLIAspect;
