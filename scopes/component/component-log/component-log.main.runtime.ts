import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import path from 'path';
import moment from 'moment';
import pMap from 'p-map';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { compact } from 'lodash';
import pMapSeries from 'p-map-series';
import { Version } from '@teambit/legacy/dist/scope/models';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils/path';
import { getFilesDiff } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
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

export type FileHashDiffFromParent = {
  filePath: string; // path OS absolute
  hash?: string; // if undefined, the file was deleted in this snap
  parentHash?: string; // if undefined, the file was added in this snap
};

export class ComponentLogMain {
  constructor(private workspace: Workspace | undefined) {}

  /**
   * get component log sorted by the timestamp in ascending order (from the earliest to the latest)
   */
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

  async getChangedFilesFromParent(id: string): Promise<FileHashDiffFromParent[]> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.resolveComponentId(id);
    const modelComp = await workspace.scope.getBitObjectModelComponent(componentId, true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const versionObj = (await workspace.scope.getBitObjectVersion(modelComp!, componentId.version, true)) as Version;
    const firstParent = versionObj.parents[0];
    const parentObj = firstParent
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ((await workspace.scope.getBitObjectVersion(modelComp!, firstParent.toString(), true)) as Version)
      : null;
    const compDir = workspace.componentDir(componentId, { ignoreVersion: true });
    const results: FileHashDiffFromParent[] = compact(
      versionObj.files.map((file) => {
        const parentFile = parentObj?.files.find((f) => f.relativePath === file.relativePath);
        if (parentFile?.file.isEqual(file.file)) return null;
        return {
          filePath: path.join(compDir, file.relativePath),
          hash: file.file.toString(),
          parentHash: parentFile?.file.toString(),
        };
      })
    );
    const filesOnParentOnly = (parentObj?.files || []).filter(
      (parentFile) => !versionObj.files.find((file) => file.relativePath === parentFile.relativePath)
    );
    if (filesOnParentOnly.length) {
      results.push(
        ...filesOnParentOnly.map((file) => ({
          filePath: file.relativePath,
          hash: undefined,
          parentHash: file.file.toString(),
        }))
      );
    }

    return results;
  }

  async getFileHistoryHashes(filePath: string): Promise<FileLog[]> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.getComponentIdByPath(filePath);
    if (!componentId) throw new Error(`unable to find component for file ${filePath}`);

    const rootDir = workspace.componentDir(componentId, undefined);

    const logs = await this.getLogs(componentId.toString());

    const filePathAsLinux = pathNormalizeToLinux(filePath);
    const filePathRelativeInComponent = filePathAsLinux.replace(`${rootDir}/`, '');

    const modelComp = await workspace.scope.getBitObjectModelComponent(componentId);
    if (!modelComp) return []; // probably a new component
    const results: FileLog[] = [];
    await pMap(
      logs,
      async (logItem) => {
        const versionObj = await workspace.scope.getBitObjectVersion(modelComp, logItem.hash, true);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const fileInComp = versionObj!.files.find((f) => f.relativePath === filePathRelativeInComponent);
        if (!fileInComp) return;

        results.push({
          hash: logItem.hash,
          tag: logItem.tag,
          username: logItem.username,
          email: logItem.email,
          date: logItem.date || '<N/A>',
          message: logItem.message,
          fileHash: fileInComp.file.toString(),
        });
      },
      { concurrency: 100 }
    );

    // remove entries that their fileHash is the same as the previous one
    let lastFileHash: string;
    results.forEach((item, index) => {
      if (index === 0) {
        lastFileHash = item.fileHash;
        return;
      }
      if (item.fileHash === lastFileHash) {
        delete results[index];
      }
      lastFileHash = item.fileHash;
    });

    return compact(results);
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
  static dependencies = [CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const componentLog = new ComponentLogMain(workspace);
    cli.register(new LogCmd(componentLog), new LogFileCmd(componentLog));
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
