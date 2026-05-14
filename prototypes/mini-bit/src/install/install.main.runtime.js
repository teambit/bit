import { InstallAspect } from './install.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';
import descriptors from './install.commands.js';
import { pretendInstall } from './install-internals.js';

export class InstallMain {
  static id = InstallAspect.id;
  static dependencies = [LoggerAspect, WorkspaceAspect, CLIAspect];
  static slots = [];

  static async provider([logger, workspace, cli]) {
    logger.createLogger('install').info('ready');
    cli.register({
      ...descriptors[0],
      report: async () => pretendInstall(Object.keys(workspace.components())),
    });
    return new InstallMain();
  }
}
