import path from 'path';
import fs from 'fs-extra';
import { CompFiles, Workspace, FilesStatus } from '@teambit/workspace';
import { PathLinux, PathOsBasedAbsolute, PathOsBasedRelative, pathJoinLinux } from '@teambit/legacy/dist/utils/path';
import pMap from 'p-map';
import { SnappingMain } from '@teambit/snapping';
import { LanesMain } from '@teambit/lanes';
import { InstallMain } from '@teambit/install';
import { ExportMain } from '@teambit/export';
import { CheckoutMain } from '@teambit/checkout';
import { ApplyVersionResults } from '@teambit/merging';
import { ComponentLogMain, FileHashDiffFromParent } from '@teambit/component-log';

const FILES_HISTORY_DIR = 'files-history';
const LAST_SNAP_DIR = 'last-snap';

type PathFromLastSnap = { [relativeToWorkspace: PathLinux]: string };

type InitSCMEntry = {
  filesStatus: FilesStatus;
  pathsFromLastSnap: PathFromLastSnap;
  compDir: PathLinux;
};

type DataToInitSCM = { [compId: string]: InitSCMEntry };

export class APIForIDE {
  constructor(
    private workspace: Workspace,
    private snapping: SnappingMain,
    private lanes: LanesMain,
    private installer: InstallMain,
    private exporter: ExportMain,
    private checkout: CheckoutMain,
    private componentLog: ComponentLogMain
  ) {}

  async listIdsWithPaths() {
    const ids = await this.workspace.listIds();
    return ids.reduce((acc, id) => {
      acc[id.toStringWithoutVersion()] = this.workspace.componentDir(id);
      return acc;
    }, {});
  }

  async getMainFilePath(id: string): Promise<PathOsBasedAbsolute> {
    const compId = await this.workspace.resolveComponentId(id);
    const comp = await this.workspace.get(compId);
    return path.join(this.workspace.componentDir(compId), comp.state._consumer.mainFile);
  }

  async importLane(
    laneName: string,
    { skipDependencyInstallation }: { skipDependencyInstallation?: boolean }
  ): Promise<string[]> {
    const results = await this.lanes.switchLanes(laneName, {
      skipDependencyInstallation,
      getAll: true,
    });
    return (results.components || []).map((c) => c.id.toString());
  }

  async listLanes() {
    return this.lanes.getLanes({ showDefaultLane: true });
  }

  async createLane(name: string) {
    return this.lanes.createLane(name);
  }

  async getCompFiles(id: string): Promise<{ dirAbs: string; filesRelative: PathOsBasedRelative[] }> {
    const compId = await this.workspace.resolveComponentId(id);
    const comp = await this.workspace.get(compId);
    const dirAbs = this.workspace.componentDir(comp.id);
    const filesRelative = comp.state.filesystem.files.map((file) => file.relative);
    return { dirAbs, filesRelative };
  }

  async getCompFilesDirPathFromLastSnap(id: string): Promise<{ [relativePath: string]: string }> {
    const compId = await this.workspace.resolveComponentId(id);
    if (!compId.hasVersion()) return {}; // it's a new component.
    const compDir = this.workspace.componentDir(compId, { ignoreVersion: true }, { relative: true });
    // const dirName = filenamify(compId.toString(), { replacement: '_' });
    const filePathsRootDir = path.join(this.workspace.scope.path, FILES_HISTORY_DIR, LAST_SNAP_DIR, compDir);
    await fs.remove(filePathsRootDir); // in case it has old data

    const modelComponent = await this.workspace.scope.getBitObjectModelComponent(compId);
    if (!modelComponent) {
      throw new Error(`unable to find ${compId.toString()} in the local scope, please run "bit import"`);
    }
    const versionObject = await this.workspace.scope.getBitObjectVersion(modelComponent, compId.version as string);
    if (!versionObject)
      throw new Error(`unable to find the Version object of ${compId.toString()}, please run "bit import"`);
    const sourceFiles = await versionObject.modelFilesToSourceFiles(this.workspace.scope.legacyScope.objects);
    const results: { [relativePath: string]: string } = {};
    await Promise.all(
      sourceFiles.map(async (file) => {
        const filePath = path.join(filePathsRootDir, file.relative);
        await fs.outputFile(filePath, file.contents);
        results[pathJoinLinux(compDir, file.relative)] = filePath;
      })
    );
    return results;
  }

  async catObject(hash: string) {
    const object = await this.workspace.scope.legacyScope.getRawObject(hash);
    return JSON.stringify(object.content.toString());
  }

  async logFile(filePath: string) {
    const results = await this.componentLog.getFileHistoryHashes(filePath);
    return results;
  }

  async changedFilesFromParent(id: string): Promise<FileHashDiffFromParent[]> {
    const results = await this.componentLog.getChangedFilesFromParent(id);
    return results;
  }

  async setDefaultScope(scopeName: string) {
    await this.workspace.setDefaultScope(scopeName);
    return scopeName;
  }

  async getCompFilesDirPathFromLastSnapUsingCompFiles(
    compFiles: CompFiles
  ): Promise<{ [relativePath: string]: string }> {
    const compId = compFiles.id;
    if (!compId.hasVersion()) return {}; // it's a new component.
    const compDir = compFiles.compDir;
    const filePathsRootDir = path.join(this.workspace.scope.path, FILES_HISTORY_DIR, LAST_SNAP_DIR, compDir);
    await fs.remove(filePathsRootDir); // in case it has old data

    const sourceFiles = await compFiles.getHeadFiles();

    const results: { [relativePath: string]: string } = {};
    await Promise.all(
      sourceFiles.map(async (file) => {
        const filePath = path.join(filePathsRootDir, file.relative);
        await fs.outputFile(filePath, file.contents);
        results[pathJoinLinux(compDir, file.relative)] = filePath;
      })
    );
    return results;
  }

  async warmWorkspaceCache() {
    await this.workspace.warmCache();
  }

  async install() {
    return this.installer.install(undefined, { optimizeReportForNonTerminal: true });
  }

  async export() {
    const { componentsIds, removedIds, exportedLanes } = await this.exporter.export();
    return {
      componentsIds: componentsIds.map((c) => c.toString()),
      removedIds: removedIds.map((c) => c.toString()),
      exportedLanes: exportedLanes.map((l) => l.id()),
    };
  }

  async checkoutHead() {
    const results = await this.checkout.checkout({
      head: true,
      skipNpmInstall: true,
      ids: await this.workspace.listIds(),
    });
    return this.adjustCheckoutResultsToIde(results);
  }

  async switchLane(name: string) {
    const results = await this.lanes.switchLanes(name, { skipDependencyInstallation: true });
    return this.adjustCheckoutResultsToIde(results);
  }

  private adjustCheckoutResultsToIde(output: ApplyVersionResults) {
    const { components, failedComponents } = output;
    const skipped = failedComponents?.filter((f) => f.unchangedLegitimately).map((f) => f.id.toString());
    const failed = failedComponents?.filter((f) => !f.unchangedLegitimately).map((f) => f.id.toString());
    return {
      succeed: components?.map((c) => c.id.toString()),
      skipped,
      failed,
    };
  }

  async getDataToInitSCM(): Promise<DataToInitSCM> {
    const ids = await this.workspace.listIds();
    const results: DataToInitSCM = {};
    await pMap(
      ids,
      async (id) => {
        const compFiles = await this.workspace.getFilesModification(id);
        const pathsFromLastSnap = await this.getCompFilesDirPathFromLastSnapUsingCompFiles(compFiles);
        const idStr = id.toStringWithoutVersion();
        results[idStr] = {
          filesStatus: compFiles.getFilesStatus(),
          pathsFromLastSnap,
          compDir: compFiles.compDir,
        };
      },
      { concurrency: 30 }
    );

    return results;
  }

  async getFilesStatus(id: string): Promise<FilesStatus> {
    const componentId = await this.workspace.resolveComponentId(id);
    const compFiles = await this.workspace.getFilesModification(componentId);
    return compFiles.getFilesStatus();
  }

  async getCompFilesDirPathFromLastSnapForAllComps(): Promise<{ [relativePath: string]: string }> {
    const ids = await this.workspace.listIds();
    let results = {};
    await pMap(
      ids,
      async (id) => {
        const idStr = id.toStringWithoutVersion();
        const compResults = await this.getCompFilesDirPathFromLastSnap(idStr);
        results = { ...results, ...compResults };
      },
      { concurrency: 30 }
    );
    return results;
  }

  getCurrentLaneName(): string {
    return this.workspace.getCurrentLaneId().name;
  }

  async tagOrSnap(message = '') {
    const params = { message, build: false };
    return this.workspace.isOnMain() ? this.snapping.tag(params) : this.snapping.snap(params);
  }

  async tag(message = ''): Promise<string[]> {
    const params = { message, build: false };
    const results = await this.snapping.tag(params);
    return (results?.taggedComponents || []).map((c) => c.id.toString());
  }

  async snap(message = ''): Promise<string[]> {
    const params = { message, build: false };
    const results = await this.snapping.snap(params);
    return (results?.snappedComponents || []).map((c) => c.id.toString());
  }
}
