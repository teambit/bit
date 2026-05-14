import { Aspect } from '../harmony/aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';

export const StatusAspect = Aspect.create({
  id: 'teambit.component/status',
  dependencies: [LoggerAspect, WorkspaceAspect, CLIAspect],
  runtimes: {
    main: () => import('./status.main.runtime.js'),
  },
});

export default StatusAspect;
