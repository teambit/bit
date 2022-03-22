import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import CommunityAspect, { CommunityMain } from '@teambit/community';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';

export class SnappingMain {
  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli, community]: [Workspace, CLIMain, CommunityMain]) {
    const snapCmd = new SnapCmd();
    const tagCmd = new TagCmd(community.getBaseDomain());
    cli.register(tagCmd, snapCmd);
    return new SnappingMain();
  }
}

SnappingAspect.addRuntime(SnappingMain);
