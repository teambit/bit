import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import chalk from 'chalk';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { ComponentLogAspect } from './component-log.aspect';
import LogCmd from './log-cmd';
import { buildSnapGraph } from './snap-graph';

export class ComponentLogMain {
  constructor(private workspace: Workspace | undefined) {}

  async getLogs(id: string, isRemote: boolean, shortHash = false) {
    if (isRemote) {
      const consumer = this.workspace?.consumer;
      const bitId: BitId = BitId.parse(id, true);
      const remote = await getRemoteByName(bitId.scope as string, consumer);
      return remote.log(bitId);
    }
    if (!this.workspace) throw new OutsideWorkspaceError();
    const componentId = await this.workspace.resolveComponentId(id);
    const logs = await this.workspace.scope.getLogs(componentId, shortHash);
    logs.forEach((log) => {
      log.date = log.date ? new Date(parseInt(log.date)).toLocaleString() : undefined;
    });
    return logs;
  }

  async getLogsWithParents(id: string) {
    const logs = await this.getLogs(id, false, true);
    const graph = buildSnapGraph(logs);
    const sorted = graph.toposort();
    return sorted.map((node) => this.stringifyLogInfoOneLine(node.attr));
  }

  private stringifyLogInfoOneLine(logInfo: ComponentLogInfo) {
    const parents = logInfo.parents.length ? `Parent(s): ${logInfo.parents.join(', ')}` : '<N/A>';
    return `${chalk.yellow(logInfo.hash)} ${logInfo.username || ''} ${logInfo.date || ''} ${
      logInfo.message
    }, ${parents}`;
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, community]: [CLIMain, Workspace, CommunityMain]) {
    const componentLog = new ComponentLogMain(workspace);
    cli.register(new LogCmd(componentLog, community.getDocsDomain()));
    return componentLog;
  }
}

ComponentLogAspect.addRuntime(ComponentLogMain);

export type ComponentLogInfo = {
  hash: string;
  message: string;
  onLane?: boolean;
  parents: string[];
  username?: string;
  email?: string;
  date?: string;
  tag?: string;
};
