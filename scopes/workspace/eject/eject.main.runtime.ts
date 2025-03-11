import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { InstallAspect, InstallMain } from '@teambit/install';
import { EjectCmd } from './eject-cmd';
import { EjectAspect } from './eject.aspect';
import { ComponentsEjector, EjectOptions, EjectResults } from './components-ejector';

export class EjectMain {
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private logger: Logger
  ) {}
  async eject(componentIds: ComponentID[], ejectOptions: EjectOptions = {}): Promise<EjectResults> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (this.workspace.isOnLane()) {
      throw new Error('unable to eject when the workspace is on a lane, please use "bit lane eject" to delete the component from the lane and install the main version');
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
