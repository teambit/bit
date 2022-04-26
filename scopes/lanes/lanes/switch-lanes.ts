import mapSeries from 'p-map-series';
import loader from '@teambit/legacy/dist/cli/loader';
import { BEFORE_CHECKOUT } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { RemoteLaneId } from '@teambit/legacy/dist/lane-id/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { BitId } from '@teambit/legacy-bit-id';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import { Version } from '@teambit/legacy/dist/scope/models';
import { LaneComponent } from '@teambit/legacy/dist/scope/models/lane';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import WorkspaceLane from '@teambit/legacy/dist/consumer/bit-map/workspace-lane';
import {
  applyVersion,
  ComponentStatus,
  CheckoutProps,
  deleteFilesIfNeeded,
  markFilesToBeRemovedIfNeeded,
} from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import {
  FailedComponents,
  getMergeStrategyInteractive,
  ApplyVersionResults,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import createNewLane from '@teambit/legacy/dist/consumer/lanes/create-lane';
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';

export type SwitchProps = {
  laneName: string;
  remoteScope?: string;
  ids?: BitId[];
  existingOnWorkspaceOnly: boolean;
  localLaneName?: string;
  remoteLaneScope?: string;
  remoteLaneName?: string;
  remoteLaneComponents?: LaneComponent[];
  localTrackedLane?: string;
  newLaneName?: string;
};

export async function switchLanes(
  consumer: Consumer,
  switchProps: SwitchProps,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  if (consumer.isLegacy) throw new LanesIsDisabled();
  await populateSwitchProps(consumer, switchProps);
  const { ids } = switchProps;
  const allComponentsStatus: ComponentStatus[] = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find(
    (component) => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict) {
    if (!checkoutProps.promptMergeOptions && !checkoutProps.mergeStrategy) {
      throw new GeneralError(
        `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--manual" to manually merge changes or use "--theirs / --ours" to choose one of the conflicted versions`
      );
    }
    if (!checkoutProps.mergeStrategy) checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
  }
  const failedComponents: FailedComponents[] = allComponentsStatus
    .filter((componentStatus) => componentStatus.failureMessage)
    .map((componentStatus) => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage as string }));

  const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
  // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
  // which can be an issue when some components are also dependencies of others
  const componentsResults = await mapSeries(succeededComponents, ({ id, componentFromFS, mergeResults }) => {
    return applyVersion(consumer, id, componentFromFS, mergeResults, checkoutProps);
  });

  markFilesToBeRemovedIfNeeded(succeededComponents, componentsResults);

  await saveLanesData();

  const componentsWithDependencies = componentsResults
    .map((c) => c.component)
    .filter((c) => c) as ComponentWithDependencies[];

  const manyComponentsWriter = new ManyComponentsWriter({
    consumer,
    componentsWithDependencies,
    installNpmPackages: !checkoutProps.skipNpmInstall,
    override: true,
    verbose: checkoutProps.verbose,
    writeDists: !checkoutProps.ignoreDist,
    writeConfig: checkoutProps.writeConfig,
    writePackageJson: !checkoutProps.ignorePackageJson,
  });
  await manyComponentsWriter.writeAll();
  await deleteFilesIfNeeded(componentsResults, consumer);

  const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

  await consumer.onDestroy();

  return { components: appliedVersionComponents, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatusP = (ids as BitId[]).map((id) => getComponentStatus(consumer, id, switchProps));
      const componentsStatus = await Promise.all(componentsStatusP);
      await tmp.clear();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }
  async function saveLanesData() {
    await saveCheckedOutLaneInfo(consumer, {
      remoteLaneScope: switchProps.remoteLaneScope,
      remoteLaneName: switchProps.remoteLaneName,
      localLaneName: switchProps.localLaneName,
      addTrackingInfo: !switchProps.localTrackedLane,
      laneComponents: switchProps.remoteLaneComponents,
    });
  }
}

async function populateSwitchProps(consumer: Consumer, switchProps: SwitchProps) {
  const lanes = await consumer.scope.listLanes();
  const isDefaultLane = switchProps.laneName === DEFAULT_LANE;

  const localLane = lanes.find((lane) => lane.name === switchProps.laneName);

  if (isDefaultLane || localLane) {
    populatePropsAccordingToLocalLane();
  } else {
    await populatePropsAccordingToRemoteLane();
  }

  async function populatePropsAccordingToRemoteLane() {
    let remoteLaneId: RemoteLaneId;
    try {
      remoteLaneId = RemoteLaneId.parse(switchProps.laneName);
    } catch (e) {
      throw new GeneralError(
        `invalid lane id "${switchProps.laneName}", the lane ${switchProps.laneName} doesn't exist.`
      );
    }
    if (remoteLaneId.name === DEFAULT_LANE) {
      throw new GeneralError(`invalid remote lane id "${switchProps.laneName}". to switch to the main lane on remote,
      run "bit switch main" and then "bit import".`);
    }
    // fetch the remote to update all heads
    const localTrackedLane = consumer.scope.lanes.getLocalTrackedLaneByRemoteName(
      remoteLaneId.name,
      remoteLaneId.scope as string
    );
    switchProps.localLaneName = switchProps.newLaneName || localTrackedLane || remoteLaneId.name;
    if (consumer.getCurrentLaneId().name === switchProps.localLaneName) {
      throw new GeneralError(`already checked out to "${switchProps.localLaneName}"`);
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([remoteLaneId]);
    if (remoteLaneObjects.length === 0) {
      throw new GeneralError(
        `invalid lane id "${switchProps.laneName}", the lane ${switchProps.laneName} doesn't exist.`
      );
    }
    const remoteLaneComponents = remoteLaneObjects[0].components;
    switchProps.remoteLaneName = remoteLaneId.name;
    switchProps.laneName = remoteLaneId.name;
    switchProps.remoteLaneScope = remoteLaneId.scope;
    switchProps.remoteScope = remoteLaneId.scope;
    switchProps.ids = remoteLaneComponents.map((l) => l.id.changeVersion(l.head.toString()));
    switchProps.remoteLaneComponents = remoteLaneComponents;
    switchProps.localTrackedLane = localTrackedLane || undefined;
    const laneExistsLocally = lanes.find((l) => l.name === switchProps.localLaneName);
    if (laneExistsLocally) {
      throw new GeneralError(`unable to checkout to a remote lane ${switchProps.remoteScope}/${switchProps.laneName}.
the local lane "${switchProps.localLaneName}" already exists, please switch to the local lane first by running "bit switch ${switchProps.localLaneName}"
then, to merge the remote lane into the local lane, run "bit lane merge ${switchProps.localLaneName} --remote ${switchProps.remoteScope}"`);
    }
  }

  function populatePropsAccordingToLocalLane() {
    switchProps.localLaneName = switchProps.laneName;
    if (consumer.getCurrentLaneId().name === switchProps.laneName) {
      throw new GeneralError(`already checked out to "${switchProps.laneName}"`);
    }
    if (switchProps.laneName === DEFAULT_LANE) {
      switchProps.ids = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
      return;
    }
    if (!localLane) {
      throw new GeneralError(
        `unable to find a local lane "${switchProps.laneName}", to create a new lane please run "bit lane create"`
      );
    }
    switchProps.ids = localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
  }
}

async function saveCheckedOutLaneInfo(
  consumer: Consumer,
  opts: {
    remoteLaneScope?: string;
    remoteLaneName?: string;
    localLaneName?: string;
    addTrackingInfo?: boolean;
    laneComponents?: LaneComponent[];
  }
) {
  const saveRemoteLaneToBitmap = () => {
    if (opts.remoteLaneScope) {
      consumer.bitMap.setRemoteLane(RemoteLaneId.from(opts.remoteLaneName as string, opts.remoteLaneScope));
      // add versions to lane
    }
  };
  const throwIfLaneExists = async () => {
    const allLanes = await consumer.scope.listLanes();
    if (allLanes.find((l) => l.name === opts.localLaneName)) {
      throw new GeneralError(`unable to checkout to lane "${opts.localLaneName}".
the lane already exists. please switch to the lane and merge`);
    }
  };

  if (opts.remoteLaneScope) {
    await throwIfLaneExists();
    await createNewLane(consumer, opts.localLaneName as string, opts.laneComponents);
    if (opts.addTrackingInfo) {
      // otherwise, it is tracked already
      consumer.scope.lanes.trackLane({
        localLane: opts.localLaneName as string,
        remoteLane: opts.remoteLaneName as string,
        remoteScope: opts.remoteLaneScope as string,
      });
    }
  }

  saveRemoteLaneToBitmap();
  consumer.scope.lanes.setCurrentLane(opts.localLaneName as string);
  const workspaceLane =
    opts.localLaneName === DEFAULT_LANE ? null : WorkspaceLane.load(opts.localLaneName as string, consumer.scope.path);
  consumer.bitMap.syncWithLanes(workspaceLane);
}

async function getComponentStatus(consumer: Consumer, id: BitId, switchProps: SwitchProps): Promise<ComponentStatus> {
  const componentStatus: ComponentStatus = { id };
  const returnFailure = (msg: string) => {
    componentStatus.failureMessage = msg;
    return componentStatus;
  };
  const modelComponent = await consumer.scope.getModelComponentIfExist(id);
  if (!modelComponent) {
    return returnFailure(`component ${id.toString()} had never imported`);
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
  if (unmerged && unmerged.resolved === false) {
    return returnFailure(
      `component ${id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
    );
  }
  const version = id.version;
  if (!version) {
    return returnFailure(`component doesn't have any snaps on ${DEFAULT_LANE}`);
  }
  const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
  const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
  if (!existingBitMapId) {
    if (switchProps.existingOnWorkspaceOnly) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is not in the workspace`);
    }
    return { componentFromFS: undefined, componentFromModel: componentOnLane, id, mergeResults: null };
  }
  if (!existingBitMapId.hasVersion()) {
    // happens when switching from main to a lane and a component was snapped on the lane.
    // in the .bitmap file, the version is "latest" or empty. so we just need to write the component according to the
    // model. we don't care about the componentFromFS
    return { componentFromFS: undefined, componentFromModel: componentOnLane, id, mergeResults: null };
  }
  const currentlyUsedVersion = existingBitMapId.version;
  if (currentlyUsedVersion === version) {
    return returnFailure(`component ${id.toStringWithoutVersion()} is already at version ${version}`);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const baseComponent: Version = await modelComponent.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const component = await consumer.loadComponent(existingBitMapId);
  const isModified = await consumer.isComponentModified(baseComponent, component);
  let mergeResults: MergeResultsThreeWay | null | undefined;
  const isHeadSameAsMain = () => {
    const head = modelComponent.getHead();
    if (!head) return false;
    if (!existingBitMapId.version) return false;
    const tagVersion = modelComponent.getTagOfRefIfExists(head);
    const headVersion = tagVersion || head.toString();
    return existingBitMapId.version === headVersion;
  };
  if (isModified) {
    if (!isHeadSameAsMain()) {
      throw new GeneralError(
        `unable to checkout ${id.toStringWithoutVersion()}, the component is modified and belongs to another lane`
      );
    }

    const otherComponent: Version = await modelComponent.loadVersion(
      existingBitMapId.version as string, // we are here because the head is same as main. so, existingBitMapId.version must be set
      consumer.scope.objects
    );
    mergeResults = await threeWayMerge({
      consumer,
      otherComponent,
      otherLabel: version,
      currentComponent: component,
      currentLabel: `${currentlyUsedVersion} modified`,
      baseComponent,
    });
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return { componentFromFS: component, componentFromModel: componentOnLane, id, mergeResults };
}
