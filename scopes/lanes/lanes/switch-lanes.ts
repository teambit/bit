import mapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { BitId } from '@teambit/legacy-bit-id';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import { Version, Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
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
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { Workspace } from '@teambit/workspace';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { createLane } from './create-lane';

export type SwitchProps = {
  laneName: string;
  ids?: BitId[];
  existingOnWorkspaceOnly: boolean;
  remoteLane?: Lane;
  localTrackedLane?: string;
  alias?: string;
};

export class LaneSwitcher {
  private consumer: Consumer;
  private laneIdToSwitch: LaneId; // populated by `this.populateSwitchProps()`
  private laneToSwitchTo: Lane | undefined; // populated by `this.populateSwitchProps()`, if default-lane, it's undefined
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private switchProps: SwitchProps,
    private checkoutProps: CheckoutProps
  ) {
    this.consumer = this.workspace.consumer;
  }

  async switch(): Promise<ApplyVersionResults> {
    this.logger.setStatusLine(`switching lanes`);
    await this.populateSwitchProps();
    const allComponentsStatus: ComponentStatus[] = await this.getAllComponentsStatus();
    const componentWithConflict = allComponentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict) {
      if (!this.checkoutProps.promptMergeOptions && !this.checkoutProps.mergeStrategy) {
        throw new GeneralError(
          `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--manual" to manually merge changes or use "--theirs / --ours" to choose one of the conflicted versions`
        );
      }
      if (!this.checkoutProps.mergeStrategy) this.checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
    }
    const failedComponents: FailedComponents[] = allComponentsStatus
      .filter((componentStatus) => componentStatus.failureMessage)
      .map((componentStatus) => ({
        id: componentStatus.id,
        failureMessage: componentStatus.failureMessage as string,
        unchangedLegitimately: componentStatus.unchangedLegitimately,
      }));

    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const componentsResults = await mapSeries(succeededComponents, ({ id, componentFromFS, mergeResults }) => {
      return applyVersion(this.consumer, id, componentFromFS, mergeResults, this.checkoutProps);
    });

    markFilesToBeRemovedIfNeeded(succeededComponents, componentsResults);

    await this.saveLanesData();

    const componentsWithDependencies = componentsResults
      .map((c) => c.component)
      .filter((c) => c) as ComponentWithDependencies[];

    const manyComponentsWriter = new ManyComponentsWriter({
      consumer: this.consumer,
      componentsWithDependencies,
      installNpmPackages: !this.checkoutProps.skipNpmInstall,
      override: true,
      verbose: this.checkoutProps.verbose,
      writeConfig: this.checkoutProps.writeConfig,
    });
    await manyComponentsWriter.writeAll();
    await deleteFilesIfNeeded(componentsResults, this.consumer);

    const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

    await this.consumer.onDestroy();

    return { components: appliedVersionComponents, failedComponents };
  }

  private async populateSwitchProps() {
    const laneId = await this.consumer.scope.lanes.parseLaneIdFromString(this.switchProps.laneName);

    const localLane = await this.consumer.scope.loadLane(laneId);
    if (laneId.isDefault()) {
      await this.populatePropsAccordingToDefaultLane();
    } else if (localLane) {
      this.populatePropsAccordingToLocalLane(localLane);
    } else {
      await this.populatePropsAccordingToRemoteLane(laneId);
    }
  }

  private async populatePropsAccordingToRemoteLane(remoteLaneId: LaneId) {
    this.laneIdToSwitch = remoteLaneId;
    this.logger.debug(`populatePropsAccordingToRemoteLane, remoteLaneId: ${remoteLaneId.toString()}`);
    if (this.consumer.getCurrentLaneId().isEqual(remoteLaneId)) {
      throw new BitError(`already checked out to "${remoteLaneId.toString()}"`);
    }
    // fetch the remote to update all heads
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(this.consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([remoteLaneId]);
    if (remoteLaneObjects.length === 0) {
      throw new BitError(`error: the lane ${this.switchProps.laneName} doesn't exist.`);
    }
    if (remoteLaneObjects.length > 1) {
      const allLanes = remoteLaneObjects.map((l) => l.id()).join(', ');
      throw new BitError(`switching to multiple lanes is not supported. got: ${allLanes}`);
    }
    const remoteLane = remoteLaneObjects[0];
    this.switchProps.laneName = remoteLaneId.name;
    this.switchProps.ids = remoteLane.components.map((l) => l.id.changeVersion(l.head.toString()));
    this.switchProps.localTrackedLane = this.consumer.scope.lanes.getAliasByLaneId(remoteLaneId) || undefined;
    this.switchProps.remoteLane = remoteLane;
    this.laneToSwitchTo = remoteLane;
    this.logger.debug(`populatePropsAccordingToRemoteLane, completed`);
  }

  private async populatePropsAccordingToDefaultLane() {
    if (!this.consumer.isOnLane()) {
      throw new BitError(`already checked out to "${this.switchProps.laneName}"`);
    }
    this.switchProps.ids = await this.consumer.getIdsOfDefaultLane();
    this.laneIdToSwitch = LaneId.from(DEFAULT_LANE, this.consumer.scope.name);
  }

  private populatePropsAccordingToLocalLane(localLane: Lane) {
    if (this.consumer.getCurrentLaneId().name === this.switchProps.laneName) {
      throw new BitError(`already checked out to "${this.switchProps.laneName}"`);
    }
    this.switchProps.ids = localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
    this.laneIdToSwitch = localLane.toLaneId();
    this.laneToSwitchTo = localLane;
  }

  private async getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const { ids } = this.switchProps;
    const tmp = new Tmp(this.consumer.scope);
    try {
      const componentsStatusP = (ids as BitId[]).map((id) => getComponentStatus(this.consumer, id, this.switchProps));
      const componentsStatus = await Promise.all(componentsStatusP);
      await tmp.clear();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }

  private async saveLanesData() {
    const throwIfLaneExists = async () => {
      const allLanes = await this.consumer.scope.listLanes();
      if (allLanes.find((l) => l.toLaneId().isEqual(this.laneIdToSwitch))) {
        throw new BitError(`unable to checkout to lane "${this.laneIdToSwitch.toString()}".
  the lane already exists. please switch to the lane and merge`);
      }
    };

    const localLaneName = this.switchProps.alias || this.laneIdToSwitch.name;
    if (this.switchProps.remoteLane) {
      await throwIfLaneExists();
      await createLane(this.consumer, this.laneIdToSwitch.name, this.laneIdToSwitch.scope, this.switchProps.remoteLane);
      if (!this.switchProps.localTrackedLane) {
        this.consumer.scope.lanes.trackLane({
          localLane: localLaneName,
          remoteLane: this.laneIdToSwitch.name,
          remoteScope: this.laneIdToSwitch.scope,
        });
      }
    }

    this.consumer.setCurrentLane(this.laneIdToSwitch, !this.laneToSwitchTo?.isNew);
    this.consumer.bitMap.syncWithLanes(this.laneToSwitchTo);
  }
}

async function getComponentStatus(consumer: Consumer, id: BitId, switchProps: SwitchProps): Promise<ComponentStatus> {
  const componentStatus: ComponentStatus = { id };
  const returnFailure = (msg: string, unchangedLegitimately = false) => {
    componentStatus.failureMessage = msg;
    componentStatus.unchangedLegitimately = unchangedLegitimately;
    return componentStatus;
  };
  const modelComponent = await consumer.scope.getModelComponentIfExist(id);
  if (!modelComponent) {
    return returnFailure(`component ${id.toString()} had never imported`, true);
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
  if (unmerged) {
    return returnFailure(
      `component ${id.toStringWithoutVersion()} is in during-merge state, please snap/tag it first (or use bit merge --resolve/--abort)`
    );
  }
  const version = id.version;
  if (!version) {
    return returnFailure(`component doesn't have any snaps on ${DEFAULT_LANE}`, true);
  }
  const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
  const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
  if (componentOnLane.isRemoved()) {
    return returnFailure(`component has been removed`, true);
  }
  if (!existingBitMapId) {
    if (switchProps.existingOnWorkspaceOnly) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is not in the workspace`, true);
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
    return returnFailure(`component ${id.toStringWithoutVersion()} is already at version ${version}`, true);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const baseComponent: Version = await modelComponent.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const component = await consumer.loadComponent(existingBitMapId);
  // don't use `consumer.isModified` here. otherwise, if there are dependency changes, the user can't discard them
  // and won't be able to switch lanes.
  const isModified = await consumer.isComponentSourceCodeModified(baseComponent, component);
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
