import { Aspect } from '../harmony/aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { ScopeAspect } from '../scope/scope.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';

export const WorkspaceAspect = Aspect.create({
  id: 'teambit.workspace/workspace',
  dependencies: [LoggerAspect, ScopeAspect, CLIAspect],
  runtimes: {
    main: () => import('./workspace.main.runtime.js'),
  },
});

export default WorkspaceAspect;
