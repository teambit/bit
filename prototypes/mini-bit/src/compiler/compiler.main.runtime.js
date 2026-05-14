import { CompilerAspect } from './compiler.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';
import descriptors from './compiler.commands.js';
import { pretendCompile } from './compiler-internals.js';

export class CompilerMain {
  static id = CompilerAspect.id;
  static dependencies = [LoggerAspect, WorkspaceAspect, CLIAspect];
  static slots = [];

  static async provider([logger, workspace, cli]) {
    logger.createLogger('compiler').info('ready');
    cli.register({
      ...descriptors[0],
      report: async () => pretendCompile(Object.keys(workspace.components())),
    });
    return new CompilerMain();
  }
}
