import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { ComponentID } from '@teambit/component-id';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { EjectCmd } from './eject-cmd';
import { EjectAspect } from './eject.aspect';
import type { EjectOptions, EjectResults } from './components-ejector';
import { ComponentsEjector } from './components-ejector';

export class EjectMain {
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private logger: Logger
  ) {}
  async eject(componentIds: ComponentID[], ejectOptions: EjectOptions = {}): Promise<EjectResults> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (this.workspace.isOnLane()) {
      throw new Error(
        'unable to eject when the workspace is on a lane, please use "bit lane eject" to delete the component from the lane and install the main version'
      );
    }
    const componentEjector = new ComponentsEjector(
      this.workspace,
      this.install,
      this.logger,
      componentIds,
      ejectOptions
    );
    return componentEjector.eject();
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect, InstallAspect];

  static async provider([cli, workspace, loggerMain, install]: [CLIMain, Workspace, LoggerMain, InstallMain]) {
    const logger = loggerMain.createLogger(EjectAspect.id);
    const ejectMain = new EjectMain(workspace, install, logger);
    cli.register(new EjectCmd(ejectMain, workspace));

    return ejectMain;
  }
}

EjectAspect.addRuntime(EjectMain);
