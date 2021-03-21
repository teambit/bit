import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EjectCmd } from './eject-cmd';
import { EjectAspect } from './eject.aspect';

export class EjectMain {
  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect];

  static async provider([cli, workspace, loggerMain]: [CLIMain, Workspace, LoggerMain]) {
    const logger = loggerMain.createLogger(EjectAspect.id);
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('eject');
      cli.register(new EjectCmd(workspace, logger));
    }

    return new EjectMain();
  }
}

EjectAspect.addRuntime(EjectMain);
