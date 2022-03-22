import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';

export class SnappingMain {
  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli]: [Workspace, CLIMain]) {
    const snapCmd = new SnapCmd();
    if (!workspace.isLegacy) {
      cli.register(snapCmd);
    }
    return new SnappingMain();
  }
}

SnappingAspect.addRuntime(SnappingMain);
