import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { LaneDiffCmd } from '@teambit/lanes.modules.diff';
import { LanesAspect } from './lanes.aspect';
import { LaneCmd, LaneListCmd, LaneShowCmd } from './lane.cmd';

export class LanesMain {
  static slots = [];
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, scope, workspace]: [CLIMain, ScopeMain, Workspace]) {
    const laneCmd = new LaneCmd(workspace, scope);
    laneCmd.commands = [
      new LaneListCmd(workspace, scope),
      new LaneShowCmd(workspace, scope),
      new LaneDiffCmd(workspace, scope),
    ];
    cli.register(laneCmd);
    return new LanesMain();
  }
}

LanesAspect.addRuntime(LanesMain);
