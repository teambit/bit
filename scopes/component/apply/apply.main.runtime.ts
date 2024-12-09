import { ApplyAspect } from './apply.aspect';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { compact } from 'lodash';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import pMapSeries from 'p-map-series';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Lane } from '@teambit/scope.objects';
import { LaneId } from '@teambit/lane-id';
import { ExportAspect, ExportMain } from '@teambit/export';
import {
  SnapDataParsed,
  SnapDataPerCompRaw,
  SnapFromScopeResults,
  SnappingMain,
  tagModelComponent,
  SnappingAspect,
  BasicTagParams,
} from '@teambit/snapping';
import { ForkingAspect, ForkingMain } from '@teambit/forking';
import { InstallAspect, InstallMain } from '@teambit/install';
import { NewComponentHelperAspect, NewComponentHelperMain } from '@teambit/new-component-helper';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import { ApplyCmd } from './apply-cmd';

export type ApplyResults = {
  newIds?: ComponentID[]; // relevant only for --workspace
  updatedIds?: ComponentID[]; // relevant only for --workspace
} & SnapFromScopeResults;

export class ApplyMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private snapping: SnappingMain,
    private newComponentHelper: NewComponentHelperMain,
    private lanes: LanesMain,
    private forking: ForkingMain,
    private install: InstallMain,
    private exporter: ExportMain
  ) {}

  async applyWithFork(
    snapDataPerCompRaw: SnapDataPerCompRaw[],
    params: {
      push?: boolean;
      ignoreIssues?: string;
      lane?: string;
      updateDependents?: boolean;
      tag?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<ApplyResults> {
    const allAreForkedFrom = snapDataPerCompRaw.every((s) => s.forkFrom);
    if (!allAreForkedFrom) {
      throw new BitError(`when forkedFrom prop is used, all components must have the forkedFrom prop`);
    }
    const laneIdStr = params.lane;
    const lane = await this.createLaneIfNeeded(laneIdStr);
    const snapDataPerComp = snapDataPerCompRaw.map((snapData) => {
      return {
        componentId: ComponentID.fromString(snapData.componentId),
        dependencies: snapData.dependencies || [],
        aspects: snapData.aspects,
        message: snapData.message,
        files: snapData.files,
        isNew: snapData.isNew,
        mainFile: snapData.mainFile,
        newDependencies: (snapData.newDependencies || []).map((dep) => ({
          id: dep.id,
          version: dep.version,
          isComponent: dep.isComponent ?? true,
          type: dep.type ?? 'runtime',
        })),
        removeDependencies: snapData.removeDependencies,
        forkFrom: ComponentID.fromString(snapData.forkFrom!),
        version: snapData.version,
      };
    });

    // console.log('snapDataPerComp', JSON.stringify(snapDataPerComp, undefined, 2));

    const allCompIds = snapDataPerComp.map((s) => s.componentId);
    const forkedFromData = compact(snapDataPerComp.map((t) => (t.forkFrom ? t : null)));
    const forkMultipleData: Array<{
      sourceId: string;
      targetId?: string;
      targetScope?: string;
      env?: string;
    }> = forkedFromData.map((f) => ({
      sourceId: f.forkFrom!.toString(),
      targetId: f.componentId.fullName,
      targetScope: f.componentId.scope,
    }));
    const forkResults = await this.forking.forkMultipleFromRemote(forkMultipleData, { refactor: true });
    const newEnvData: Record<string, ComponentID[]> = {};
    forkedFromData.forEach((f) => {
      const bitmapElem = this.workspace.bitMap.getBitmapEntry(f.componentId);
      // @ts-ignore
      const env = bitmapElem?.config?.['teambit.envs/envs'].env;
      if (!env) return;
      const found = forkedFromData.find((fo) => fo.forkFrom?.toStringWithoutVersion() === env);
      if (!found) return;
      const newEnvStr = found.componentId.toString();
      if (!newEnvData[newEnvStr]) newEnvData[newEnvStr] = [];
      newEnvData[newEnvStr].push(f.componentId);
    });
    await pMapSeries(Object.entries(newEnvData), async ([env, compIds]) => {
      await this.workspace.setEnvToComponents(ComponentID.fromString(env), compIds, false);
    });
    const getSnapData = (id: ComponentID): SnapDataParsed => {
      const snapData = snapDataPerComp.find((t) => {
        return t.componentId.isEqual(id, { ignoreVersion: true });
      });
      if (!snapData) throw new Error(`unable to find ${id.toString()} in snapDataPerComp`);
      return snapData;
    };
    const newForkedComponents = await this.workspace.getMany(forkResults.map((f) => f.targetCompId));

    await Promise.all(
      newForkedComponents.map(async (comp) => {
        const snapData = getSnapData(comp.id);
        if (snapData.files?.length) {
          await this.snapping.updateSourceFiles(comp, snapData.files);
          await this.workspace.write(comp);
        }
        this.updateConfigInBitmap(snapData, comp.id);
      })
    );
    await this.workspace.bitMap.write();
    // if you don't clear the cache here, the installation assumes all components have the old env.
    await this.workspace.clearCache();
    await this.install.install(undefined, {
      dedupe: true,
      import: false,
      copyPeerToRuntimeOnRoot: true,
      copyPeerToRuntimeOnComponents: false,
      updateExisting: false,
      addMissingDeps: true,
    });
    // if we don't clear the cache here, the "build" process during tag doesn't install the necessary packages
    // on the capsules.
    await this.workspace.clearCache();
    const components = await this.workspace.getMany(forkedFromData.map((f) => f.componentId));

    const consumerComponents = components.map((c) => c.state._consumer);
    const ids = ComponentIdList.fromArray(allCompIds);
    await this.snapping.throwForVariousIssues(components, params.ignoreIssues);
    const shouldTag = Boolean(params.tag);
    const results = await tagModelComponent({
      ...params,
      components,
      consumerComponents,
      tagDataPerComp: snapDataPerComp.map((s) => ({
        componentId: s.componentId,
        message: s.message,
        dependencies: [],
        versionToTag: shouldTag ? s.version || 'patch' : undefined,
      })),
      snapping: this.snapping,
      skipAutoTag: true,
      persist: true,
      isSnap: !shouldTag,
      ids,
      message: params.message as string,
      updateDependentsOnLane: params.updateDependents,
    });

    const { taggedComponents } = results;
    let exportedIds: ComponentIdList | undefined;
    if (params.push) {
      const updatedLane = lane ? await this.scope.legacyScope.loadLane(lane.toLaneId()) : undefined;
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids,
        allVersions: false,
        laneObject: updatedLane,
        // no need other snaps. only the latest one. without this option, when snapping on lane from another-scope, it
        // may throw an error saying the previous snaps don't exist on the filesystem.
        // (see the e2e - "snap on a lane when the component is new to the lane and the scope")
        exportHeadsOnly: true,
      });
      exportedIds = exported;
    }

    return {
      snappedComponents: taggedComponents,
      snappedIds: taggedComponents.map((comp) => comp.id),
      exportedIds,
    };
  }

  private updateConfigInBitmap(snapData: SnapDataParsed, componentId: ComponentID) {
    if (!snapData.aspects) return;
    const bitmapElem = this.workspace.bitMap.getBitmapEntry(componentId);
    if (!bitmapElem) throw new Error(`unable to find ${componentId.toString()} in the bitmap`);
    const currentConfig = bitmapElem.config;
    if (!currentConfig) {
      this.workspace.bitMap.setEntireConfig(componentId, snapData.aspects);
      return;
    }
    const currentEnvSettings = currentConfig['teambit.envs/envs'];
    const currentEnv = currentEnvSettings !== '-' && currentEnvSettings.env;
    const newEnv = snapData.aspects['teambit.envs/envs']?.env;
    if (!currentEnv || !newEnv) {
      this.workspace.bitMap.setEntireConfig(componentId, { ...currentConfig, ...snapData.aspects });
      return;
    }
    const currentEnvWithPotentialVer = Object.keys(currentConfig).find(
      (c) => c === currentEnv || c.startsWith(`${currentEnv}@`)
    );
    if (currentEnvWithPotentialVer) delete currentConfig[currentEnvWithPotentialVer];
    delete currentConfig['teambit.envs/envs'];
    this.workspace.bitMap.setEntireConfig(componentId, { ...currentConfig, ...snapData.aspects });
  }

  private async createLaneIfNeeded(laneIdStr?: string): Promise<Lane | undefined> {
    if (!laneIdStr) return undefined;
    const laneId = LaneId.parse(laneIdStr);
    const currentLane = await this.lanes.getCurrentLane();
    if (currentLane) {
      const currentLaneId = currentLane.toLaneId();
      if (currentLaneId.isEqual(laneId)) return currentLane;
      throw new Error(
        `unable to apply to a different lane "${laneIdStr}" while the current lane is "${currentLaneId.toString()}"`
      );
    }
    const isLaneExistsOnRemote = await this.lanes.isLaneExistsOnRemote(laneId);
    if (isLaneExistsOnRemote) {
      throw new Error(`unable to apply to a lane "${laneIdStr}" that exists on the remote. please create a new lane`);
    }
    const laneResult = await this.lanes.createLane(laneId.name, { scope: laneId.scope });
    return laneResult.lane;
  }

  async apply(
    snapDataPerCompRaw: SnapDataPerCompRaw[],
    params: {
      push?: boolean;
      ignoreIssues?: string;
      lane?: string;
      updateDependents?: boolean;
      tag?: boolean;
      snap?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<ApplyResults> {
    const laneIdStr = params.lane;
    const lane = await this.createLaneIfNeeded(laneIdStr);
    const snapDataPerComp = snapDataPerCompRaw.map((snapData) => {
      return {
        componentId: ComponentID.fromString(snapData.componentId),
        dependencies: snapData.dependencies || [],
        aspects: snapData.aspects,
        message: snapData.message,
        files: snapData.files,
        isNew: snapData.isNew,
        mainFile: snapData.mainFile,
        newDependencies: (snapData.newDependencies || []).map((dep) => ({
          id: dep.id,
          version: dep.version,
          isComponent: dep.isComponent ?? true,
          type: dep.type ?? 'runtime',
        })),
        removeDependencies: snapData.removeDependencies,
        // forkFrom: ComponentID.fromString(snapData.forkFrom!),
        version: snapData.version,
      };
    });

    // console.log('snapDataPerComp', JSON.stringify(snapDataPerComp, undefined, 2));
    const newIds: ComponentID[] = [];
    const updatedIds: ComponentID[] = [];
    await pMapSeries(snapDataPerComp, async (snapData) => {
      const existing = this.workspace.bitMap.getBitmapEntryIfExist(snapData.componentId, { ignoreVersion: true });
      if (existing && snapData.isNew) {
        throw new Error(
          `component "${snapData.componentId.toString()}" already exists in the workspace. please remove the "isNew" prop`
        );
      }
      if (existing) {
        const comp = await this.workspace.get(snapData.componentId);
        if (snapData.files?.length) {
          await this.snapping.updateSourceFiles(comp, snapData.files);
          await this.workspace.write(comp);
        }
        this.updateConfigInBitmap(snapData, comp.id);
        updatedIds.push(snapData.componentId);
      } else {
        if (!snapData.files)
          throw new Error(
            `snapData for ${snapData.componentId.toString()} is missing the "files" prop. this prop is required when creating a new component`
          );
        if (!snapData.mainFile) {
          const potentialMain = snapData.files.find((f) => f.path === 'index.ts' || f.path === 'index.js');
          if (potentialMain) snapData.mainFile = potentialMain.path;
          else {
            throw new Error(
              `snapData for ${snapData.componentId.toString()} is missing the "mainFile" prop. this prop is required when creating a new component`
            );
          }
        }
        await this.newComponentHelper.writeAndAddNewCompFromFiles(
          snapData.files,
          snapData.componentId,
          snapData.mainFile,
          { incrementPathIfConflicted: true },
          snapData.aspects
        );
        newIds.push(snapData.componentId);
      }
    });

    // without this, when adding new import statements to a component, the installation doesn't pick them up
    await this.workspace.clearCache();

    await this.install.install(undefined, {
      dedupe: true,
      import: false,
      copyPeerToRuntimeOnRoot: true,
      copyPeerToRuntimeOnComponents: false,
      updateExisting: false,
      addMissingDeps: true,
    });

    if (!params.snap && !params.tag) {
      return {
        snappedComponents: [],
        snappedIds: [],
        newIds,
        updatedIds,
      };
    }

    // if we don't clear the cache here, the "build" process during tag doesn't install the necessary packages
    // on the capsules.
    await this.workspace.clearCache();
    const components = await this.workspace.getMany(snapDataPerComp.map((f) => f.componentId));

    const consumerComponents = components.map((c) => c.state._consumer);
    const ids = ComponentIdList.fromArray(components.map((c) => c.id));
    await this.snapping.throwForVariousIssues(components, params.ignoreIssues);
    const shouldTag = Boolean(params.tag);
    const results = await tagModelComponent({
      ...params,
      components,
      consumerComponents,
      tagDataPerComp: snapDataPerComp.map((s) => ({
        componentId: s.componentId,
        message: s.message,
        dependencies: [],
        versionToTag: shouldTag ? s.version || 'patch' : undefined,
      })),
      snapping: this.snapping,
      skipAutoTag: true,
      persist: true,
      isSnap: !shouldTag,
      ids,
      message: params.message as string,
      updateDependentsOnLane: params.updateDependents,
    });

    const { taggedComponents } = results;
    let exportedIds: ComponentIdList | undefined;
    if (params.push) {
      const updatedLane = lane ? await this.scope.legacyScope.loadLane(lane.toLaneId()) : undefined;
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids,
        allVersions: false,
        laneObject: updatedLane,
        // no need other snaps. only the latest one. without this option, when snapping on lane from another-scope, it
        // may throw an error saying the previous snaps don't exist on the filesystem.
        // (see the e2e - "snap on a lane when the component is new to the lane and the scope")
        exportHeadsOnly: true,
      });
      exportedIds = exported;
    }

    return {
      snappedComponents: taggedComponents,
      snappedIds: taggedComponents.map((comp) => comp.id),
      exportedIds,
    };
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    ScopeAspect,
    LoggerAspect,
    SnappingAspect,
    NewComponentHelperAspect,
    LanesAspect,
    ForkingAspect,
    InstallAspect,
    ExportAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    scope,
    loggerMain,
    snapping,
    newComponentHelper,
    lanes,
    forking,
    install,
    exporter,
  ]: [
    CLIMain,
    Workspace,
    ScopeMain,
    LoggerMain,
    SnappingMain,
    NewComponentHelperMain,
    LanesMain,
    ForkingMain,
    InstallMain,
    ExportMain,
  ]) {
    const logger = loggerMain.createLogger(ApplyAspect.id);
    const applyMain = new ApplyMain(workspace, scope, snapping, newComponentHelper, lanes, forking, install, exporter);
    cli.register(new ApplyCmd(applyMain, logger));
    return applyMain;
  }
}

ApplyAspect.addRuntime(ApplyMain);

export default ApplyMain;
