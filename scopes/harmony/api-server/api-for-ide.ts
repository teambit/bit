import path from 'path';
import fs from 'fs-extra';
import filenamify from 'filenamify';
import { CompFiles, Workspace, FilesStatus } from '@teambit/workspace';
import { PathOsBasedAbsolute, PathOsBasedRelative, pathJoinLinux } from '@teambit/legacy.utils';
import pMap from 'p-map';
import { SnappingMain } from '@teambit/snapping';
import { LanesMain } from '@teambit/lanes';
import { InstallMain } from '@teambit/install';
import { ExportMain } from '@teambit/export';
import { CheckoutMain } from '@teambit/checkout';
import { ApplyVersionResults } from '@teambit/merging';
import { ComponentLogMain, FileHashDiffFromParent } from '@teambit/component-log';
import { Log } from '@teambit/legacy/dist/scope/models/lane';
import { ComponentCompareMain } from '@teambit/component-compare';
import { GeneratorMain } from '@teambit/generator';
import { getParsedHistoryMetadata } from '@teambit/legacy/dist/consumer/consumer';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';
import { RemoveMain } from '@teambit/remove';
import { compact, uniq } from 'lodash';
import { ConfigMain } from '@teambit/config';
import { LANE_REMOTE_DELIMITER, LaneId } from '@teambit/lane-id';
import { ApplicationMain } from '@teambit/application';
import { DeprecationMain } from '@teambit/deprecation';
import { EnvsMain } from '@teambit/envs';
import fetch from 'node-fetch';

const FILES_HISTORY_DIR = 'files-history';
const ENV_ICONS_DIR = 'env-icons';
const LAST_SNAP_DIR = 'last-snap';
const CMD_HISTORY = 'command-history-ide';

type PathLinux = string; // problematic to get it from @teambit/legacy/dist/utils/path.

type PathFromLastSnap = { [relativeToWorkspace: PathLinux]: string };

type InitSCMEntry = {
  filesStatus: FilesStatus;
  pathsFromLastSnap: PathFromLastSnap;
  compDir: PathLinux;
};

type DataToInitSCM = { [compId: string]: InitSCMEntry };

type LaneObj = {
  name: string;
  scope: string;
  id: string;
  log: Log;
  components: Array<{ id: string; head: string }>;
  isNew: boolean;
  forkedFrom?: string;
};

type ModifiedByConfig = {
  id: string;
  version: string;
  dependencies?: { workspace: string[]; scope: string[] };
  aspects?: { workspace: Record<string, any>; scope: Record<string, any> };
};

type WorkspaceHistory = {
  current: PathOsBasedAbsolute;
  history: Array<{ path: PathOsBasedAbsolute; fileId: string; reason?: string }>;
};

type CompMetadata = {
  id: string;
  isDeprecated: boolean;
  appName?: string; // in case it's an app
  env: {
    id: string;
    name?: string;
    icon: string;
    localIconPath?: string;
  };
};

export class APIForIDE {
  private existingEnvIcons: string[] | undefined;
  constructor(
    private workspace: Workspace,
    private snapping: SnappingMain,
    private lanes: LanesMain,
    private installer: InstallMain,
    private exporter: ExportMain,
    private checkout: CheckoutMain,
    private componentLog: ComponentLogMain,
    private componentCompare: ComponentCompareMain,
    private generator: GeneratorMain,
    private remove: RemoveMain,
    private config: ConfigMain,
    private application: ApplicationMain,
    private deprecation: DeprecationMain,
    private envs: EnvsMain
  ) {}

  async logStartCmdHistory(op: string) {
    const str = `${op}, started`;
    await this.writeToCmdHistory(str);
  }

  async logFinishCmdHistory(op: string, code: number) {
    const endStr = code === 0 ? 'succeeded' : 'failed';
    const str = `${op}, ${endStr}`;
    await this.writeToCmdHistory(str);
  }

  getProcessPid() {
    return process.pid;
  }

  private async writeToCmdHistory(str: string) {
    await fs.appendFile(path.join(this.workspace.scope.path, CMD_HISTORY), `${new Date().toISOString()} ${str}\n`);
  }

  async listIdsWithPaths() {
    const ids = this.workspace.listIds();
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

  async getWorkspaceHistory(): Promise<WorkspaceHistory> {
    const current = this.workspace.bitMap.getPath();
    const bitmapHistoryDir = this.workspace.consumer.getBitmapHistoryDir();
    const historyPaths = await fs.readdir(bitmapHistoryDir);
    const historyMetadata = await this.workspace.consumer.getParsedBitmapHistoryMetadata();
    const history = historyPaths.map((historyPath) => {
      const fileName = path.basename(historyPath);
      const fileId = fileName.replace('.bitmap-', '');
      const reason = historyMetadata[fileId];
      return { path: path.join(bitmapHistoryDir, fileName), fileId, reason };
    });
    const historySorted = history.sort((a, b) => fileIdToTimestamp(b.fileId) - fileIdToTimestamp(a.fileId));

    return { current, history: historySorted };
  }

  async getConfigHistory(): Promise<WorkspaceHistory> {
    const workspaceConfig = this.config.workspaceConfig;
    if (!workspaceConfig) throw new Error('getConfigHistory(), workspace config is missing');
    const current = workspaceConfig.path;
    const configHistoryDir = workspaceConfig.getBackupHistoryDir();
    const historyPaths = await fs.readdir(configHistoryDir);
    const historyMetadata = await getParsedHistoryMetadata(workspaceConfig.getBackupMetadataFilePath());
    const history = historyPaths.map((historyPath) => {
      const fileName = path.basename(historyPath);
      const fileId = fileName;
      const reason = historyMetadata[fileId];
      return { path: path.join(configHistoryDir, fileName), fileId, reason };
    });
    const historySorted = history.sort((a, b) => fileIdToTimestamp(b.fileId) - fileIdToTimestamp(a.fileId));

    return { current, history: historySorted };
  }

  async importLane(
    laneName: string,
    { skipDependencyInstallation }: { skipDependencyInstallation?: boolean }
  ): Promise<string[]> {
    const results = await this.lanes.switchLanes(laneName, {
      skipDependencyInstallation,
    });
    return (results.components || []).map((c) => c.id.toString());
  }

  async getCurrentLaneObject(): Promise<LaneObj | undefined> {
    const currentLane = await this.lanes.getCurrentLane();
    if (!currentLane) return undefined;
    const components = currentLane.components.map((c) => {
      return {
        id: c.id.toStringWithoutVersion(),
        head: c.head.toString(),
      };
    });
    return {
      name: currentLane.name,
      scope: currentLane.scope,
      id: currentLane.id(),
      log: currentLane.log,
      components,
      isNew: currentLane.isNew,
      forkedFrom: currentLane.forkedFrom?.toString(),
    };
  }

  async listLanes() {
    return this.lanes.getLanes({ showDefaultLane: true });
  }

  async createLane(name: string) {
    if (name.includes(LANE_REMOTE_DELIMITER)) {
      const laneId = LaneId.parse(name);
      return this.lanes.createLane(laneId.name, { scope: laneId.scope });
    }
    return this.lanes.createLane(name);
  }

  async getCompsMetadata(): Promise<CompMetadata[]> {
    const comps = await this.workspace.list();
    const apps = await this.application.listAppsIdsAndNames();
    const results: CompMetadata[] = await pMap(
      comps,
      async (comp) => {
        const id = comp.id;
        const deprecationInfo = await this.deprecation.getDeprecationInfo(comp);
        const foundApp = apps.find((app) => app.id === id.toString());
        const env = this.envs.getEnv(comp);
        return {
          id: id.toStringWithoutVersion(),
          isDeprecated: deprecationInfo.isDeprecate,
          appName: foundApp?.name,
          env: {
            id: env.id,
            name: env.name,
            icon: env.icon,
          },
        };
      },
      { concurrency: 30 }
    );
    const allIcons = uniq(compact(results.map((r) => r.env.icon)));
    const iconsMap = await this.getEnvIconsMapFetchIfMissing(allIcons);
    results.forEach((r) => {
      r.env.localIconPath = iconsMap[r.env.icon];
    });
    return results;
  }

  private getEnvIconsFullPath() {
    return path.join(this.workspace.scope.path, ENV_ICONS_DIR);
  }

  private async getExistingEnvIcons(): Promise<string[]> {
    if (!this.existingEnvIcons) {
      const envIconsDir = this.getEnvIconsFullPath();
      await fs.ensureDir(envIconsDir);
      const existingIcons = await fs.readdir(envIconsDir);
      this.existingEnvIcons = existingIcons;
    }
    return this.existingEnvIcons;
  }

  private async getEnvIconsMapFetchIfMissing(icons: string[]): Promise<{ [iconHttpUrl: string]: string }> {
    const existingIcons = await this.getExistingEnvIcons();
    const iconsMap: Record<string, string> = {};
    await Promise.all(
      icons.map(async (icon) => {
        const iconFileName = filenamify(icon, { replacement: '-' });
        const fullIconPath = path.join(this.workspace.scope.path, ENV_ICONS_DIR, iconFileName);
        if (existingIcons.includes(iconFileName)) {
          iconsMap[icon] = fullIconPath;
          return;
        }
        let res;
        // download the icon from the url and save it locally.
        try {
          res = await fetch(icon);
        } catch (err: any) {
          throw new Error(`failed to get the icon from ${icon}, error: ${err.message}`);
        }
        const svgText = await res.text();
        await fs.outputFile(fullIconPath, svgText);
        iconsMap[icon] = fullIconPath;
        this.existingEnvIcons?.push(iconFileName);
      })
    );
    return iconsMap;
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
    await fs.ensureDir(filePathsRootDir);

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

  async blame(filePath: string) {
    const results = await this.componentLog.blame(filePath);
    return results;
  }

  async changedFilesFromParent(id: string): Promise<FileHashDiffFromParent[]> {
    const results = await this.componentLog.getChangedFilesFromParent(id);
    return results;
  }

  async getConfigForDiff(id: string) {
    const results = await this.componentCompare.getConfigForDiffById(id);
    return results;
  }

  async setDefaultScope(scopeName: string) {
    await this.workspace.setDefaultScope(scopeName);
    return scopeName;
  }

  getDefaultScope() {
    return this.workspace.defaultScope;
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
  async clearCache() {
    await this.workspace.clearCache();
    this.workspace.clearAllComponentsCache();
  }

  async install(options = {}) {
    const opts = {
      optimizeReportForNonTerminal: true,
      dedupe: true,
      updateExisting: false,
      import: false,
      ...options,
    };

    return this.installer.install(undefined, opts);
  }

  async export() {
    const { componentsIds, removedIds, exportedLanes, rippleJobUrls } = await this.exporter.export();
    return {
      componentsIds: componentsIds.map((c) => c.toString()),
      removedIds: removedIds.map((c) => c.toString()),
      exportedLanes: exportedLanes.map((l) => l.id()),
      rippleJobs: rippleJobUrls, // for backward compatibility. bit-extension until 1.1.52 expects rippleJobs.
      rippleJobUrls,
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

  async getTemplates() {
    const templates = await this.generator.listTemplates();
    return templates;
  }

  async createComponent(templateName: string, idIncludeScope: string) {
    if (!idIncludeScope.includes('/')) {
      throw new Error('id should include the scope name');
    }
    const [scope, ...nameSplit] = idIncludeScope.split('/');
    return this.generator.generateComponentTemplate(
      [nameSplit.join('/')],
      templateName,
      { scope },
      { optimizeReportForNonTerminal: true }
    );
  }

  async removeComponent(componentsPattern: string) {
    const results = await this.remove.remove({
      componentsPattern,
      force: true,
    });
    const serializedResults = (results.localResult as RemovedObjects).serialize();
    return serializedResults;
  }

  async deleteComponents(componentsPattern: string, opts): Promise<string[]> {
    const results = await this.remove.deleteComps(componentsPattern, opts);
    const serializedResults = results.map((c) => c.id.toString());
    return serializedResults;
  }

  async deprecateComponent(id: string, newId?: string, range?: string): Promise<boolean> {
    return this.deprecation.deprecateByCLIValues(id, newId, range);
  }
  async undeprecateComponent(id: string): Promise<boolean> {
    return this.deprecation.unDeprecateByCLIValues(id);
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

  async getModifiedByConfig(): Promise<ModifiedByConfig[]> {
    const modifiedComps = await this.workspace.modified();
    const autoTagIds = await this.workspace.listAutoTagPendingComponentIds();
    const autoTagComps = await this.workspace.getMany(autoTagIds);
    const locallyDeletedIds = await this.workspace.locallyDeletedIds();
    const locallyDeletedComps = await this.workspace.getMany(locallyDeletedIds);
    const allComps = [...modifiedComps, ...autoTagComps, ...locallyDeletedComps];
    const allIds = allComps.map((c) => c.id);
    const results = await Promise.all(
      allComps.map(async (comp) => {
        const wsComp = await this.componentCompare.getConfigForDiffByCompObject(comp, allIds);
        const scopeComp = await this.componentCompare.getConfigForDiffById(comp.id.toString());
        const hasSameDeps = JSON.stringify(wsComp.dependencies) === JSON.stringify(scopeComp.dependencies);
        const hasSameAspects = JSON.stringify(wsComp.aspects) === JSON.stringify(scopeComp.aspects);
        if (hasSameDeps && hasSameAspects) return null;
        const result: ModifiedByConfig = {
          id: comp.id.toStringWithoutVersion(),
          version: comp.id.version as string,
        };
        if (!hasSameDeps) result.dependencies = { workspace: wsComp.dependencies, scope: scopeComp.dependencies || [] };
        if (!hasSameAspects) result.aspects = { workspace: wsComp.aspects, scope: scopeComp.aspects || {} };
        return result;
      })
    );

    return compact(results);
  }

  async getDataToInitSCM(): Promise<DataToInitSCM> {
    const ids = this.workspace.listIds();
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
    const ids = this.workspace.listIds();
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

function fileIdToTimestamp(dateStr: string): number {
  const [year, month, day, hours, minutes, seconds] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
  return date.getTime();
}
