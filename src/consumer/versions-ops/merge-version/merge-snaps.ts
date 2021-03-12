import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import path from 'path';

import { Consumer } from '../..';
import { BitId, BitIds } from '../../../bit-id';
import { COMPONENT_ORIGINS } from '../../../constants';
import GeneralError from '../../../error/general-error';
import LaneId, { RemoteLaneId } from '../../../lane-id/lane-id';
import logger from '../../../logger/logger';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import { getDivergeData } from '../../../scope/component-ops/get-diverge-data';
import { UnmergedComponent } from '../../../scope/lanes/unmerged-components';
import { Lane, Version } from '../../../scope/models';
import { Ref } from '../../../scope/objects';
import { Tmp } from '../../../scope/repositories';
import { pathNormalizeToLinux } from '../../../utils';
import ManyComponentsWriter from '../../component-ops/many-components-writer';
import Component from '../../component/consumer-component';
import checkoutVersion, { applyModifiedVersion } from '../checkout-version';
import {
  ApplyVersionResult,
  ApplyVersionResults,
  FailedComponents,
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
  MergeStrategy,
} from './merge-version';
import threeWayMerge, { MergeResultsThreeWay } from './three-way-merge';

export type ComponentStatus = {
  componentFromFS?: Component | null;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  mergeResults?: MergeResultsThreeWay | null;
};

/**
 * when user is on master, it merges the remote master components into local.
 * when user is on a lane, it merges the remote lane components into the local lane.
 */
export async function mergeComponentsFromRemote(
  consumer: Consumer,
  bitIds: BitId[],
  mergeStrategy: MergeStrategy,
  noSnap: boolean,
  snapMessage: string,
  build: boolean
): Promise<ApplyVersionResults> {
  const localLaneId = consumer.getCurrentLaneId();
  const localLaneObject = await consumer.getCurrentLaneObject();
  const remoteTrackedLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(localLaneId.name);
  if (!localLaneId.isDefault() && !remoteTrackedLane) {
    throw new Error(`unable to find a remote tracked to the local lane "${localLaneId.name}"`);
  }
  const allComponentsStatus = await getAllComponentsStatus();

  return merge({
    consumer,
    mergeStrategy,
    allComponentsStatus,
    remoteName: remoteTrackedLane ? remoteTrackedLane.remoteScope : null,
    laneId: localLaneId,
    localLane: localLaneObject,
    noSnap,
    snapMessage,
    build,
  });

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map(async (bitId) => {
          const remoteLaneName = remoteTrackedLane ? remoteTrackedLane.remoteLane : localLaneId.name;
          const remoteScopeName = remoteTrackedLane ? remoteTrackedLane.remoteScope : bitId.scope;
          const remoteLaneId = RemoteLaneId.from(remoteLaneName, remoteScopeName as string);
          const remoteHead = await consumer.scope.objects.remoteLanes.getRef(remoteLaneId, bitId);
          const remoteLaneIdStr = remoteLaneId.toString();
          if (!remoteHead)
            throw new GeneralError(
              `unable to find a remote head of "${bitId.toStringWithoutVersion()}" in "${remoteLaneIdStr}"`
            );
          return getComponentStatus(
            consumer,
            bitId.changeVersion(remoteHead.toString()),
            localLaneObject,
            remoteLaneIdStr
          );
        })
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}

export async function merge({
  consumer,
  mergeStrategy,
  allComponentsStatus,
  remoteName,
  laneId,
  localLane,
  noSnap,
  snapMessage,
  build,
}: {
  consumer: Consumer;
  mergeStrategy: MergeStrategy;
  allComponentsStatus: ComponentStatus[];
  remoteName: string | null;
  laneId: LaneId;
  localLane: Lane | null;
  noSnap: boolean;
  snapMessage: string;
  build: boolean;
}) {
  const componentWithConflict = allComponentsStatus.find(
    (component) => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict && !mergeStrategy) {
    mergeStrategy = await getMergeStrategyInteractive();
  }
  const failedComponents: FailedComponents[] = allComponentsStatus
    .filter((componentStatus) => componentStatus.failureMessage)
    .map((componentStatus) => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage as string }));
  const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
  // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
  // which can be an issue when some components are also dependencies of others
  const componentsResults = await mapSeries(succeededComponents, ({ componentFromFS, id, mergeResults }) => {
    return applyVersion({
      consumer,
      componentFromFS,
      id,
      mergeResults,
      mergeStrategy,
      remoteHead: new Ref(id.version as string),
      // @ts-ignore
      remoteName: remoteName || componentFromFS.scope,
      laneId,
      localLane,
    });
  });

  if (localLane) consumer.scope.objects.add(localLane);

  await consumer.scope.objects.persist(); // persist anyway, it localLane is null it should save all master heads

  await consumer.scope.objects.unmergedComponents.write();

  const mergeSnapResults = noSnap ? null : await snapResolvedComponents(consumer, snapMessage, build);

  return { components: componentsResults, failedComponents, mergeSnapResults };
}

export async function getComponentStatus(
  consumer: Consumer,
  id: BitId,
  localLane: Lane | null,
  otherLaneName: string,
  existingOnWorkspaceOnly = false
): Promise<ComponentStatus> {
  const componentStatus: ComponentStatus = { id };
  const returnFailure = (msg: string) => {
    componentStatus.failureMessage = msg;
    return componentStatus;
  };
  const modelComponent = await consumer.scope.getModelComponentIfExist(id);
  if (!modelComponent) {
    throw new GeneralError(
      `component ${id.toString()} is on the lane but its objects were not found, please re-import the lane`
    );
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
  if (unmerged && unmerged.resolved === false) {
    return returnFailure(
      `component ${id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
    );
  }
  const version = id.version as string;
  const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
  const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
  if (!existingBitMapId) {
    if (existingOnWorkspaceOnly) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is not in the workspace`);
    }
    // @ts-ignore
    return { componentFromFS: null, componentFromModel: componentOnLane, id, mergeResults: null };
  }
  const currentlyUsedVersion = existingBitMapId.version;
  if (currentlyUsedVersion === version) {
    // @todo: maybe this check is not needed as we check for diverge later on
    if (localLane || modelComponent.hasHead()) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is already merged`);
    }
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const component = await consumer.loadComponent(existingBitMapId);
  const componentModificationStatus = await consumer.getComponentStatusById(component.id);
  if (componentModificationStatus.modified) {
    throw new GeneralError(
      `unable to merge ${id.toStringWithoutVersion()}, the component is modified, please snap/tag it first`
    );
  }
  const repo = consumer.scope.objects;
  if (localLane) {
    modelComponent.setLaneHeadLocal(localLane);
    if (modelComponent.laneHeadLocal && modelComponent.laneHeadLocal.toString() !== existingBitMapId.version) {
      throw new GeneralError(
        `unable to merge ${id.toStringWithoutVersion()}, the component is checkout to a different version than the lane head. please run "bit checkout your-lane --lane" first`
      );
    }
  }
  const otherLaneHead = new Ref(version);
  const divergeData = await getDivergeData(repo, modelComponent, otherLaneHead);
  if (!divergeData.isDiverged()) {
    if (divergeData.isLocalAhead()) {
      // do nothing!
      return returnFailure(`component ${component.id.toString()} is ahead, nothing to merge`);
    }
    if (divergeData.isRemoteAhead()) {
      // just override with the model data
      return { componentFromFS: component, componentFromModel: componentOnLane, id, mergeResults: null };
    }
    // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
    return returnFailure(`component ${component.id.toString()} is already merged`);
  }
  const baseSnap = divergeData.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
  const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
  const currentComponent: Version = await modelComponent.loadVersion(otherLaneHead.toString(), repo);
  // threeWayMerge expects `otherComponent` to be Component and `currentComponent` to be Version
  // since it doesn't matter whether we take the changes from base to current or the changes from
  // base to other, here we replace the two. the result is going to be the same.
  const mergeResults = await threeWayMerge({
    consumer,
    otherComponent: component, // this is actually the current
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    otherLabel: `${currentlyUsedVersion} (local)`,
    currentComponent, // this is actually the other
    currentLabel: `${otherLaneHead.toString()} (${otherLaneName})`,
    baseComponent,
  });
  return { componentFromFS: component, id, mergeResults };
}

export async function applyVersion({
  consumer,
  componentFromFS,
  id,
  mergeResults,
  mergeStrategy,
  remoteHead,
  remoteName,
  laneId,
  localLane,
}: {
  consumer: Consumer;
  componentFromFS: Component | null | undefined;
  id: BitId;
  mergeResults: MergeResultsThreeWay | null | undefined;
  mergeStrategy: MergeStrategy;
  remoteHead: Ref;
  remoteName: string | null;
  laneId: LaneId;
  localLane: Lane | null;
}): Promise<ApplyVersionResult> {
  const filesStatus = {};
  const unmergedComponent: UnmergedComponent = {
    // @ts-ignore
    id: { name: id.name, scope: id.scope },
    // @ts-ignore
    head: remoteHead,
    // @ts-ignore
    remote: remoteName,
    lane: laneId.name,
  };
  id = componentFromFS ? componentFromFS.id : id;
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
    componentFromFS.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    unmergedComponent.resolved = true;
    consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);

    return { id, filesStatus };
  }
  const remoteId = id.changeVersion(remoteHead.toString());
  const idToLoad = !mergeResults || mergeStrategy === MergeOptions.theirs ? remoteId : id;
  const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(idToLoad);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
  }
  const shouldWritePackageJson = async (): Promise<boolean> => {
    if (!componentMap) return true;
    const rootDir = componentMap && componentMap.rootDir;
    if (!rootDir) return false;
    const packageJsonPath = path.join(consumer.getPath(), rootDir, 'package.json');
    return fs.pathExists(packageJsonPath);
  };
  const shouldInstallNpmPackages = (): boolean => {
    if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return false;
    return true;
  };
  const writePackageJson = await shouldWritePackageJson();

  const files = componentWithDependencies.component.files;
  files.forEach((file) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
  });

  let modifiedStatus = {};
  if (mergeResults) {
    // update files according to the merge results
    modifiedStatus = applyModifiedVersion(
      files,
      mergeResults,
      mergeStrategy,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      componentWithDependencies.component.originallySharedDir
    );
  }
  const shouldDependenciesSaveAsComponents = await consumer.shouldDependenciesSavedAsComponents([id]);
  componentWithDependencies.component.dependenciesSavedAsComponents =
    shouldDependenciesSaveAsComponents[0].saveDependenciesAsComponents;

  const manyComponentsWriter = new ManyComponentsWriter({
    consumer,
    componentsWithDependencies: [componentWithDependencies],
    installNpmPackages: shouldInstallNpmPackages(),
    override: true,
    writeConfig: false, // @todo: should write if config exists before, needs to figure out how to do it.
    verbose: false, // @todo: do we need a flag here?
    writeDists: true, // @todo: do we need a flag here?
    writePackageJson,
  });
  await manyComponentsWriter.writeAll();

  // if mergeResults, the head snap is going to be updated on a later phase when snapping with two parents
  // otherwise, update the head of the current lane or master
  if (mergeResults) {
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual) {
      unmergedComponent.resolved = false;
      unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter((f) => f.conflict).map((f) => f.filePath);
    } else {
      unmergedComponent.resolved = true;
    }
    consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
  } else if (localLane) {
    localLane.addComponent({ id, head: remoteHead });
  } else {
    // this is master
    const modelComponent = await consumer.scope.getModelComponent(id);
    if (!consumer.isLegacy) modelComponent.setHead(remoteHead);
    consumer.scope.objects.add(modelComponent);
  }

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

async function snapResolvedComponents(
  consumer: Consumer,
  snapMessage: string,
  build: boolean
): Promise<null | { snappedComponents: Component[]; autoSnappedResults: AutoTagResult[] }> {
  const resolvedComponents = consumer.scope.objects.unmergedComponents.getResolvedComponents();
  logger.debug(`merge-snaps, snapResolvedComponents, total ${resolvedComponents.length.toString()} components`);
  if (!resolvedComponents.length) return null;
  const ids = BitIds.fromArray(resolvedComponents.map((r) => new BitId(r.id)));
  return consumer.snap({
    ids,
    build,
    message: snapMessage,
  });
}

export async function abortMerge(consumer: Consumer, values: string[]): Promise<ApplyVersionResults> {
  const ids = getIdsForUnresolved(consumer, values);
  // @ts-ignore not clear yet what to do with other flags
  const results = await checkoutVersion(consumer, { ids, reset: true });
  ids.forEach((id) => consumer.scope.objects.unmergedComponents.removeComponent(id.name));
  await consumer.scope.objects.unmergedComponents.write();
  return { abortedComponents: results.components };
}

export async function resolveMerge(
  consumer: Consumer,
  values: string[],
  snapMessage: string,
  build: boolean
): Promise<ApplyVersionResults> {
  const ids = getIdsForUnresolved(consumer, values);
  const { snappedComponents } = await consumer.snap({
    ids: BitIds.fromArray(ids),
    resolveUnmerged: true,
    build,
    message: snapMessage,
  });
  return { resolvedComponents: snappedComponents };
}

function getIdsForUnresolved(consumer: Consumer, idsStr?: string[]): BitId[] {
  if (idsStr && idsStr.length) {
    const bitIds = idsStr.map((id) => consumer.getParsedId(id));
    bitIds.forEach((id) => {
      const entry = consumer.scope.objects.unmergedComponents.getEntry(id.name);
      if (!entry) {
        throw new GeneralError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
      }
    });
    return bitIds;
  }
  const unresolvedComponents = consumer.scope.objects.unmergedComponents.getComponents();
  if (!unresolvedComponents.length) throw new GeneralError(`all components are resolved already, nothing to do`);
  return unresolvedComponents.map((u) => new BitId(u.id));
}
