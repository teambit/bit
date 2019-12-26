import path from 'path';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { Consumer } from '../..';
import { BitId, BitIds } from '../../../bit-id';
import LaneId from '../../../lane-id/lane-id';
import { Version, Lane } from '../../../scope/models';
import threeWayMerge, { MergeResultsThreeWay } from './three-way-merge';
import { Ref } from '../../../scope/objects';
import {
  MergeStrategy,
  getMergeStrategyInteractive,
  ApplyVersionResult,
  MergeOptions,
  FileStatus,
  ApplyVersionResults
} from './merge-version';
import Component from '../../component/consumer-component';
import { Tmp } from '../../../scope/repositories';
import { pathNormalizeToLinux } from '../../../utils';
import GeneralError from '../../../error/general-error';
import { COMPONENT_ORIGINS } from '../../../constants';
import ManyComponentsWriter from '../../component-ops/many-components-writer';
import { UnmergedComponent } from '../../../scope/lanes/unmerged-components';
import checkoutVersion, { applyModifiedVersion } from '../checkout-version';

type ComponentStatus = {
  componentFromFS?: Component;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  mergeResults?: MergeResultsThreeWay;
};

export default async function snapMerge(
  consumer: Consumer,
  bitIds: BitId[],
  mergeStrategy: MergeStrategy,
  laneId: LaneId,
  abort: boolean,
  resolve: boolean,
  noSnap: boolean,
  message: boolean
): Promise<ApplyVersionResults> {
  if (resolve || abort) {
    const ids = getIdsForUnresolved(consumer, bitIds);
    return resolve ? resolveMerge(consumer, ids) : abortMerge(consumer, ids);
  }
  const localLane = laneId.isDefault() ? null : await consumer.scope.loadLane(laneId);
  const remoteTrackedLane = consumer.scope.getRemoteTrackedDataByLocalLane(laneId.name);
  if (!laneId.isDefault() && !remoteTrackedLane) {
    throw new Error(`unable to find a remote tracked to the local lane "${laneId.name}"`);
  }
  const { components } = await consumer.loadComponents(BitIds.fromArray(bitIds));
  const allComponentsStatus = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict && !mergeStrategy) {
    mergeStrategy = await getMergeStrategyInteractive();
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const failedComponents: FailedComponents[] = allComponentsStatus
    .filter(componentStatus => componentStatus.failureMessage)
    .map(componentStatus => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage }));

  const succeededComponents = allComponentsStatus.filter(componentStatus => !componentStatus.failureMessage);
  // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
  // which can be an issue when some components are also dependencies of others
  const componentsResults = await pMapSeries(succeededComponents, ({ componentFromFS, mergeResults, remoteHead }) => {
    const remoteName = remoteTrackedLane ? remoteTrackedLane.remoteScope : componentFromFS.scope;
    return applyVersion({
      consumer,
      componentFromFS,
      id: componentFromFS.id,
      mergeResults,
      mergeStrategy,
      remoteHead,
      remoteName,
      laneId,
      localLane
    });
  });

  consumer.scope.objects.add(localLane);
  await consumer.scope.objects.persist();

  await consumer.scope.objects.unmergedComponents.write();

  await snapResolvedComponents(consumer);

  return { components: componentsResults, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        components.map(async component => {
          const remoteLaneId = remoteTrackedLane ? LaneId.from(remoteTrackedLane.remoteLane) : laneId;
          const remoteName = remoteTrackedLane ? remoteTrackedLane.remoteScope : component.scope;
          const remoteHead = await consumer.scope.objects.remoteLanes.getRef(
            remoteName as string,
            remoteLaneId,
            component.name
          );
          return getComponentStatus(consumer, component, localLane, remoteHead as Ref);
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

async function getComponentStatus(consumer: Consumer, component: Component, localLane: Lane | null, remoteHead: Ref) {
  const modelComponent = await consumer.scope.getModelComponentIfExist(component.id);
  const componentStatus: ComponentStatus = { id: component.id };
  const returnFailure = (msg: string) => {
    componentStatus.failureMessage = msg;
    return componentStatus;
  };
  if (!modelComponent) {
    return returnFailure(`component ${component.id.toString()} doesn't have any snap yet`);
  }
  const componentModificationStatus = await consumer.getComponentStatusById(component.id);
  if (componentModificationStatus.modified) {
    // @todo: should we throw new error instead and stop the entire process?
    return returnFailure(`component ${component.id.toString()} is modified, please snap or tag the component first`);
  }
  const repo = consumer.scope.objects;
  if (localLane) {
    modelComponent.laneHeadLocal = localLane.getComponentHead(modelComponent.toBitId());
  }
  modelComponent.laneHeadRemote = remoteHead;
  await modelComponent.setDivergeData(repo);
  const divergeResult = modelComponent.getDivergeData();
  const isTrueMerge = modelComponent.isTrueMergePending();
  // @todo: it it's not true merge, we still need to add the components to the local lane.
  // check if this is done already later
  if (!isTrueMerge) return returnFailure(`component ${component.id.toString()} is not diverged`);
  const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
  const currentlyUsedVersion = existingBitMapId.version;
  const baseSnap = divergeResult.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
  const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
  const currentComponent: Version = await modelComponent.loadVersion(remoteHead.toString(), repo);
  // threeWayMerge expects `otherComponent` to be Component and `currentComponent` to be Version
  // since it doesn't matter whether we take the changes from base to current or the changes from
  // base to other, here we replace the two. the result is going to be the same.
  const mergeResults = await threeWayMerge({
    consumer,
    otherComponent: component,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    otherLabel: `${currentlyUsedVersion} (local)`,
    currentComponent,
    currentLabel: `${remoteHead.toString()} (${component.id.scope}/${consumer.getCurrentLaneId().name})`,
    baseComponent
  });
  // return { componentFromFS: component, id: component.id.changeVersion(remoteHead.toString()), mergeResults, remoteHead };
  return { componentFromFS: component, id: component.id, mergeResults, remoteHead };
}

/**
 * 1) when the merge result in conflicts and the strategy is "ours", leave the FS as is
 * and update only bitmap id version. (not the componentMap object).
 *
 * 2) when the merge result in conflicts and the strategy is "theirs", write the component
 * according to id.version.
 *
 * 3) when files are modified with no conflict or files are modified with conflicts and the
 * strategy is manual, load the component according to id.version and update component.files.
 * applyModifiedVersion() docs explains what files are updated/added.
 *
 * 4) when --reset flag is used, write the component according to the bitmap version
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
export async function applyVersion({
  consumer,
  componentFromFS,
  id,
  mergeResults,
  mergeStrategy,
  remoteHead,
  remoteName,
  laneId,
  localLane
}: {
  consumer: Consumer;
  componentFromFS: Component | null;
  id: BitId;
  mergeResults: MergeResultsThreeWay | null;
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
    lane: laneId.name
  };
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
    componentFromFS.files.forEach(file => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    unmergedComponent.resolved = true;
    consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);

    return { id, filesStatus };
  }
  const remoteId = id.changeVersion(remoteHead.toString());
  const idToLoad = mergeStrategy === MergeOptions.theirs ? remoteId : id;
  const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(idToLoad);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
    componentWithDependencies.compilerDependencies = [];
    componentWithDependencies.testerDependencies = [];
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
  files.forEach(file => {
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
    writeConfig: Boolean(componentMap && componentMap.configDir), // write bit.json and config files only if it was there before
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    configDir: componentMap && componentMap.configDir,
    verbose: false, // @todo: do we need a flag here?
    writeDists: true, // @todo: do we need a flag here?
    writePackageJson
  });
  await manyComponentsWriter.writeAll();

  // if mergeResults, the head snap is going to be updated on a later phase when snapping with two parents
  // otherwise, update the head of the current lane or master
  if (mergeResults) {
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual) {
      unmergedComponent.resolved = false;
      unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter(f => f.conflict).map(f => f.filePath);
    } else {
      unmergedComponent.resolved = true;
    }
    consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
  } else if (localLane) {
    localLane.addComponent({ id, head: remoteHead });
  } else {
    // this is master
    const modelComponent = await consumer.scope.getModelComponent(id);
    modelComponent.snaps.head = remoteHead;
    consumer.scope.objects.add(modelComponent);
  }

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

async function snapResolvedComponents(consumer: Consumer) {
  const resolvedComponents = consumer.scope.objects.unmergedComponents.getResolvedComponents();
  if (!resolvedComponents.length) return;
  const ids = BitIds.fromArray(resolvedComponents.map(r => new BitId(r.id)));
  await consumer.snap({
    ids
  });
}

async function abortMerge(consumer: Consumer, ids: BitId[]): Promise<ApplyVersionResults> {
  // @ts-ignore not clear yet what to do with other flags
  const results = await checkoutVersion(consumer, { ids, reset: true });
  ids.forEach(id => consumer.scope.objects.unmergedComponents.removeComponent(id.name));
  await consumer.scope.objects.unmergedComponents.write();
  return { abortedComponents: results.components };
}

async function resolveMerge(consumer: Consumer, ids: BitId[]): Promise<ApplyVersionResults> {
  const { snappedComponents } = await consumer.snap({
    ids: BitIds.fromArray(ids),
    resolveUnmerged: true
  });
  return { snappedComponents };
}

function getIdsForUnresolved(consumer: Consumer, bitIds?: BitId[]): BitId[] {
  if (bitIds) {
    bitIds.forEach(id => {
      const entry = consumer.scope.objects.unmergedComponents.getEntry(id.name);
      if (!entry || entry.resolved) {
        throw new GeneralError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
      }
    });
    return bitIds;
  }
  const unresolvedComponents = consumer.scope.objects.unmergedComponents.getUnresolvedComponents();
  if (!unresolvedComponents.length) throw new GeneralError(`all components are resolved already, nothing to do`);
  return unresolvedComponents.map(u => new BitId(u.id));
}
