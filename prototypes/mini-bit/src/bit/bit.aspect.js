// Meta-aspect that declares the full set of core aspects.
// Used only by eager mode (and by tooling that needs the full manifest).
import { Aspect } from '../harmony/aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { ScopeAspect } from '../scope/scope.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { StatusAspect } from '../status/status.aspect.js';
import { InstallAspect } from '../install/install.aspect.js';
import { CompilerAspect } from '../compiler/compiler.aspect.js';

export const BitAspect = Aspect.create({
  id: 'teambit.harmony/bit',
  dependencies: [
    CLIAspect,
    LoggerAspect,
    ScopeAspect,
    WorkspaceAspect,
    StatusAspect,
    InstallAspect,
    CompilerAspect,
  ],
  runtimes: {
    main: () => import('./bit.main.runtime.js'),
  },
});

export default BitAspect;
