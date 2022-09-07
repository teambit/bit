import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { InstallAspect, InstallMain } from '@teambit/install';
import { EjectCmd } from './eject-cmd';
import { EjectAspect } from './eject.aspect';

export class EjectMain {
  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect, InstallAspect];

  static async provider([cli, workspace, loggerMain, install]: [CLIMain, Workspace, LoggerMain, InstallMain]) {
    const logger = loggerMain.createLogger(EjectAspect.id);
    cli.register(new EjectCmd(workspace, logger, install));

    return new EjectMain();
  }
}

EjectAspect.addRuntime(EjectMain);
