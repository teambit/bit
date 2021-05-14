import mapSeries from 'p-map-series';

import { Consumer } from '..';
import { BitId } from '../../bit-id';
import { DEFAULT_LANE } from '../../constants';
import GeneralError from '../../error/general-error';
import { RemoteLaneId } from '../../lane-id/lane-id';
import { ComponentWithDependencies } from '../../scope';
import { Version } from '../../scope/models';
import { LaneComponent } from '../../scope/models/lane';
import { Tmp } from '../../scope/repositories';
import WorkspaceLane from '../bit-map/workspace-lane';
import ManyComponentsWriter from '../component-ops/many-components-writer';
import { applyVersion, CheckoutProps, ComponentStatus } from '../versions-ops/checkout-version';
import { FailedComponents, getMergeStrategyInteractive } from '../versions-ops/merge-version';
import threeWayMerge, { MergeResultsThreeWay } from '../versions-ops/merge-version/three-way-merge';
import createNewLane from './create-lane';

export type SwitchProps = {
  create: boolean;
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

export default async function switchLanes(consumer: Consumer, switchProps: SwitchProps, checkoutProps: CheckoutProps) {
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

  const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

  return { components: appliedVersionComponents, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatusP = (ids as BitId[]).map((id) => getComponentStatus(consumer, id, switchProps));
      const componentsStatus = await Promise.all(componentsStatusP);
      await tmp.clear();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return componentsStatus;
    } catch (err) {
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
    } else {
      const trackData = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(opts.localLaneName as string);
      if (!trackData) {
        return; // the lane was never exported
      }
      consumer.bitMap.setRemoteLane(RemoteLaneId.from(trackData.remoteLane, trackData.remoteScope));
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
  consumer.bitMap.reLoadAfterSwitchingLane(workspaceLane);
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
    // @ts-ignore
    return { componentFromFS: null, componentFromModel: componentOnLane, id, mergeResults: null };
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
  const isHeadSameAsMaster = () => {
    const head = modelComponent.getHead();
    if (!head) return false;
    if (!existingBitMapId.version) return false;
    const tagVersion = modelComponent.getTagOfRefIfExists(head);
    const headVersion = tagVersion || head.toString();
    return existingBitMapId.version === headVersion;
  };
  if (isModified) {
    if (!isHeadSameAsMaster()) {
      throw new GeneralError(
        `unable to checkout ${id.toStringWithoutVersion()}, the component is modified and belongs to another lane`
      );
    }

    const currentComponent: Version = await modelComponent.loadVersion(
      existingBitMapId.version as string, // we are here because the head is same as master. so, existingBitMapId.version must be set
      consumer.scope.objects
    );
    mergeResults = await threeWayMerge({
      consumer,
      otherComponent: component,
      otherLabel: `${currentlyUsedVersion} modified`,
      currentComponent,
      currentLabel: version,
      baseComponent,
    });
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return { componentFromFS: component, componentFromModel: componentOnLane, id, mergeResults };
}
