import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { LegacyComponentLog as ComponentLog } from '@teambit/legacy-component-log';
import path from 'path';
import moment from 'moment';
import pMap from 'p-map';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { compact } from 'lodash';
import pMapSeries from 'p-map-series';
import { Source, Version } from '@teambit/legacy/dist/scope/models';
import { pathNormalizeToLinux, PathOsBasedAbsolute } from '@teambit/toolbox.path.path';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { getFilesDiff } from '@teambit/legacy.component-diff';
import chalk from 'chalk';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { diffLines } from 'diff';
import { ComponentLogAspect } from './component-log.aspect';
import LogCmd from './log-cmd';
import { buildSnapGraph } from './snap-graph';
import { LogFileCmd } from './log-file-cmd';
import { BlameCmd } from './blame-cmd';

export type FileLog = {
  hash: string;
  tag?: string;
  username?: string;
  email?: string;
  date: string;
  message: string;
  fileHash: string;
  parentFileHash?: string;
  fileDiff?: string;
};

export type BlameLineInfo = {
  lineNumber: number;
  lineContent: string;
  username: string;
  email?: string;
  date: string;
  message: string;
  hash: string;
  tag?: string;
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
  async getLogs(id: string, isRemote?: boolean, shortHash = false, shortMessage = false): Promise<ComponentLog[]> {
    if (isRemote) {
      const consumer = this.workspace?.consumer;
      const bitId = ComponentID.fromString(id);
      const remote = await getRemoteByName(bitId.scope as string, consumer);
      return remote.log(bitId);
    }
    if (!this.workspace) throw new OutsideWorkspaceError();
    const componentId = await this.workspace.resolveComponentId(id);
    const logs = await this.workspace.scope.getLogs(componentId, shortHash, undefined, true);
    logs.forEach((log) => {
      log.date = log.date ? moment(new Date(parseInt(log.date))).format('YYYY-MM-DD HH:mm:ss') : undefined;
      log.message = shortMessage ? log.message.split('\n')[0] : log.message;
    });
    return logs;
  }

  async getLogsWithParents(id: string, fullHash = false, fullMessage = false) {
    const logs = await this.getLogs(id, false, !fullHash, !fullMessage);
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
    const versionObj = (await workspace.scope.getBitObjectVersion(modelComp!, componentId.version!, true)) as Version;
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

  async getFileHistoryHashes(filePath: PathOsBasedAbsolute): Promise<FileLog[]> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.getComponentIdByPath(filePath);
    if (!componentId) {
      // filePath could be from the component dir but the file is not part of the bit-component (such as component.json)
      return [];
    }

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
        const fileHash = fileInComp.file.toString();
        const getFileHashFromParent = async (parent: Ref) => {
          const parentObj = parent
            ? await workspace.scope.getBitObjectVersion(modelComp, parent.toString(), true)
            : undefined;

          const parentFileInComp = parentObj
            ? parentObj.files.find((f) => f.relativePath === filePathRelativeInComponent)
            : undefined;

          return parentFileInComp?.file.toString();
        };
        const fileHashesFromParent = versionObj ? await Promise.all(versionObj.parents.map(getFileHashFromParent)) : [];

        const getParentFileHash = () => {
          if (fileHashesFromParent.length === 0) return undefined;
          if (fileHashesFromParent.length === 1) return fileHashesFromParent[0];
          // if one parent has it, it means that this merge-snap didn't change the file.
          if (fileHashesFromParent.includes(fileHash)) return fileHash;
          return fileHashesFromParent[0];
        };

        results.push({
          hash: logItem.hash,
          tag: logItem.tag,
          username: logItem.username,
          email: logItem.email,
          date: logItem.date || '<N/A>',
          message: logItem.message,
          fileHash,
          parentFileHash: getParentFileHash(),
        });
      },
      { concurrency: 100 }
    );

    // remove entries that their fileHash is the same as their parent.
    return results.filter((r) => r.fileHash !== r.parentFileHash);
  }

  async blame(filePath: string): Promise<BlameLineInfo[]> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const absPath = path.isAbsolute(filePath) ? filePath : workspace.consumer.toAbsolutePath(filePath);
    const reversedLogs = await this.getFileHistoryHashes(absPath);
    const logs = reversedLogs.reverse();

    const getFileContent = async (hash: string) => {
      const source = (await workspace.scope.legacyScope.objects.load(Ref.from(hash), true)) as Source;
      return source.contents.toString();
    };

    // Initialize the blame array with the current file content
    const currentLog = logs[0];
    let currentContentStr = await getFileContent(currentLog.fileHash);
    const currentContentLines = currentContentStr.split('\n');
    const blameArray: Partial<BlameLineInfo>[] = currentContentLines.map((lineContent, index) => ({
      lineNumber: index + 1,
      lineContent,
      author: undefined,
      email: undefined,
      date: undefined,
      message: undefined,
      hash: undefined,
      tag: undefined,
    }));
    const populateBlameArray = (lineNumber: number, log: FileLog) => {
      blameArray[lineNumber].username = log.username;
      blameArray[lineNumber].email = log.email;
      blameArray[lineNumber].date = log.date;
      blameArray[lineNumber].message = log.message;
      blameArray[lineNumber].hash = log.hash;
      blameArray[lineNumber].tag = log.tag;
    };

    // Keep track of unassigned lines
    const unblamedLineIndices = new Set(blameArray.map((_, index) => index));

    await pMapSeries(logs.reverse(), async (logItem) => {
      if (unblamedLineIndices.size === 0) return; // All lines have been assigned

      const currentHash = logItem.fileHash;
      const parentHash = logItem.parentFileHash;

      // Skip if there is no parent to compare with
      if (!parentHash) return;

      currentContentStr = await getFileContent(currentHash);
      const parentContentStr = await getFileContent(parentHash);

      const diff = diffLines(parentContentStr, currentContentStr);

      let currentLineNum = 0;

      diff.forEach((part) => {
        const lines = part.value.split('\n');
        // Remove the last empty line if the string ends with a newline
        if (lines[lines.length - 1] === '') lines.pop();

        if (part.added) {
          // Lines added in the current version
          lines.forEach(() => {
            if (unblamedLineIndices.has(currentLineNum)) {
              populateBlameArray(currentLineNum, logItem);
              unblamedLineIndices.delete(currentLineNum);
            }
            currentLineNum++;
          });
        } else if (part.removed) {
          // Lines removed from parent version; do not advance currentLineNum
          // Since these lines are not in the current version, we ignore them
        } else {
          // Unchanged lines
          currentLineNum += lines.length;
        }
      });
    });

    // Assign the oldest log info to any remaining unblamed lines
    const oldestLog = logs[logs.length - 1];
    unblamedLineIndices.forEach((lineIdx) => {
      populateBlameArray(lineIdx, oldestLog);
    });

    return blameArray as BlameLineInfo[];
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
    cli.register(new LogCmd(componentLog), new LogFileCmd(componentLog), new BlameCmd(componentLog));
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
