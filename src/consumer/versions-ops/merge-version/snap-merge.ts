import path from 'path';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { Consumer } from '../..';
import { BitId, BitIds } from '../../../bit-id';
import LaneId from '../../../lane-id/lane-id';
import { ModelComponent, Version, Lane } from '../../../scope/models';
import threeWayMerge, { MergeResultsThreeWay } from './three-way-merge';
import { Ref } from '../../../scope/objects';
import {
  MergeStrategy,
  getMergeStrategyInteractive,
  ApplyVersionResult,
  MergeOptions,
  FileStatus
} from './merge-version';
import Component from '../../component/consumer-component';
import { Tmp } from '../../../scope/repositories';
import { pathNormalizeToLinux } from '../../../utils';
import GeneralError from '../../../error/general-error';
import { COMPONENT_ORIGINS } from '../../../constants';
import ManyComponentsWriter from '../../component-ops/many-components-writer';
import { UnmergedComponent } from '../../../scope/lanes/unmerged-components';
import { applyModifiedVersion } from '../checkout-version';

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
  laneId?: LaneId
) {
  if (!laneId) laneId = consumer.getCurrentLane();
  const lane = laneId.isDefault() ? null : await consumer.scope.loadLane(laneId);
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
    return applyVersion(consumer, componentFromFS, mergeResults, mergeStrategy, remoteHead, laneId as LaneId);
  });

  await consumer.scope.objects.unmergedComponents.write();

  await snapResolvedComponents(consumer);

  return { components: componentsResults, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        components.map(component => getComponentStatus(consumer, component, laneId as LaneId, lane))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}

async function getComponentStatus(consumer: Consumer, component: Component, laneId: LaneId, lane: Lane | null) {
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
    return returnFailure(`component ${component.id.toString()} is modified, please snap or tag the component first`);
  }
  const repo = consumer.scope.objects;
  await modelComponent.populateLocalAndRemoteHeads(repo, laneId, lane);
  const divergeResult = await modelComponent.getDivergeData(repo);
  if (!divergeResult) return returnFailure(`component ${component.id.toString()} is already merged`);
  const isTrueMerge = ModelComponent.isTrueMergePending(divergeResult);
  if (!isTrueMerge) return returnFailure(`component ${component.id.toString()} is not diverged`);
  const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
  const currentlyUsedVersion = existingBitMapId.version;
  const baseSnap = divergeResult.commonSnapBeforeDiverge;
  const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
  const remoteHead: Ref = modelComponent.laneHeadRemote as Ref;
  const currentComponent: Version = await modelComponent.loadVersion(remoteHead.toString(), repo);
  const mergeResults = await threeWayMerge({
    consumer,
    otherComponent: component,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    otherLabel: `${currentlyUsedVersion} (local)`,
    currentComponent,
    currentLabel: `${remoteHead.toString()} (${component.id.scope}/${laneId.name})`,
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
async function applyVersion(
  consumer: Consumer,
  componentFromFS: Component,
  mergeResults: MergeResultsThreeWay,
  mergeStrategy: MergeStrategy,
  remoteHead: Ref,
  laneId: LaneId
): Promise<ApplyVersionResult> {
  const id = componentFromFS.id;
  const filesStatus = {};
  const unmergedComponent: UnmergedComponent = {
    // @ts-ignore
    id: { name: id.name, scope: id.scope },
    // @ts-ignore
    head: remoteHead,
    // @ts-ignore
    remote: id.scope, // @todo: change according to the remote user entered
    lane: laneId.name
  };
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
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
  const componentMap = componentFromFS.componentMap;
  if (!componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
    componentWithDependencies.compilerDependencies = [];
    componentWithDependencies.testerDependencies = [];
  }
  const rootDir = componentMap.rootDir;
  const shouldWritePackageJson = async (): Promise<boolean> => {
    if (!rootDir) return false;
    const packageJsonPath = path.join(consumer.getPath(), rootDir, 'package.json');
    return fs.pathExists(packageJsonPath);
  };
  const shouldInstallNpmPackages = (): boolean => {
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return false;
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
    writeConfig: Boolean(componentMap.configDir), // write bit.json and config files only if it was there before
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    configDir: componentMap.configDir,
    verbose: false, // @todo: do we need a flag here?
    writeDists: true, // @todo: do we need a flag here?
    writePackageJson
  });
  await manyComponentsWriter.writeAll();

  if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual) {
    unmergedComponent.resolved = false;
    unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter(f => f.conflict).map(f => f.filePath);
  } else {
    unmergedComponent.resolved = true;
  }
  consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);

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
