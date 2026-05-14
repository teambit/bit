import { Aspect } from '../harmony/aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';

export const InstallAspect = Aspect.create({
  id: 'teambit.dependencies/install',
  dependencies: [LoggerAspect, WorkspaceAspect, CLIAspect],
  runtimes: {
    main: () => import('./install.main.runtime.js'),
  },
});

export default InstallAspect;
