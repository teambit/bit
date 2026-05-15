import { Aspect } from '../harmony/aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';

export const CompilerAspect = Aspect.create({
  id: 'teambit.compilation/compiler',
  dependencies: [LoggerAspect, WorkspaceAspect, CLIAspect],
  runtimes: {
    main: () => import('./compiler.main.runtime.js'),
  },
});

export default CompilerAspect;
