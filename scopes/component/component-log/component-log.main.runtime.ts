import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import moment from 'moment';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import { CommunityAspect } from '@teambit/community';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils/path';
import { getFilesDiff } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import type { CommunityMain } from '@teambit/community';
import chalk from 'chalk';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { ComponentLogAspect } from './component-log.aspect';
import LogCmd from './log-cmd';
import { buildSnapGraph } from './snap-graph';
import { LogFileCmd } from './log-file-cmd';

export type FileLog = {
  hash: string;
  tag?: string;
  username?: string;
  email?: string;
  date: string;
  message: string;
  fileHash: string;
  fileDiff?: string;
};

export class ComponentLogMain {
  constructor(private workspace: Workspace | undefined) {}

  async getLogs(id: string, isRemote?: boolean, shortHash = false) {
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
      log.date = log.date ? moment(new Date(parseInt(log.date))).format('YYYY-MM-DD HH:mm:ss') : undefined;
    });
    return logs;
  }

  async getLogsWithParents(id: string) {
    const logs = await this.getLogs(id, false, true);
    const graph = buildSnapGraph(logs);
    const sorted = graph.toposort();
    return sorted.map((node) => this.stringifyLogInfoOneLine(node.attr));
  }

  async getFileLog(filePath: string) {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.getComponentIdByPath(filePath);
    if (!componentId) throw new Error(`unable to find component for file ${filePath}`);

    const rootDir = workspace.componentDir(componentId, undefined, { relative: true });

    const logs = await this.getLogs(componentId.toString());

    const filePathAsLinux = pathNormalizeToLinux(filePath);
    const filePathRelativeInComponent = filePathAsLinux.replace(`${rootDir}/`, '');

    const results: FileLog[] = [];
    let lastFile;
    await pMapSeries(logs, async (logItem) => {
      const component = await workspace.get(componentId.changeVersion(logItem.tag || logItem.hash));
      const fileInComp = component.filesystem.files.find((f) => f.relative === filePathRelativeInComponent);
      const lastResult = results[results.length - 1];
      const lastHash = lastResult?.fileHash;
      let fileHash: string;
      if (!fileInComp) {
        if (!lastHash) return;
        fileHash = '<REMOVED>';
      } else {
        fileHash = fileInComp.toSourceAsLinuxEOL().hash().toString();
      }
      if (fileHash === lastHash) return;

      let diff;
      if (lastFile && fileInComp) {
        diff = await getFilesDiff([lastFile], [fileInComp], logItem.hash, lastResult.hash, undefined);
      }

      lastFile = fileInComp;

      results.push({
        hash: logItem.hash,
        tag: logItem.tag,
        username: logItem.username,
        email: logItem.email,
        date: logItem.date || '<N/A>',
        message: logItem.message,
        fileDiff: diff?.length ? diff[0].diffOutput : undefined,
        fileHash,
      });
    });
    return results;
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
    cli.register(new LogCmd(componentLog, community.getDocsDomain()), new LogFileCmd(componentLog));
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
