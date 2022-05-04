import mapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { BitId } from '@teambit/legacy-bit-id';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import { Version, Lane } from '@teambit/legacy/dist/scope/models';
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
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { Workspace } from '@teambit/workspace';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { createLane } from './create-lane';

export type SwitchProps = {
  laneName: string;
  remoteScope?: string;
  ids?: BitId[];
  existingOnWorkspaceOnly: boolean;
  localLaneName?: string;
  remoteLaneScope?: string;
  remoteLaneName?: string;
  remoteLane?: Lane;
  localTrackedLane?: string;
  newLaneName?: string;
};

export class LaneSwitcher {
  private consumer: Consumer;
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
      .map((componentStatus) => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage as string }));

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
      writeDists: !this.checkoutProps.ignoreDist,
      writeConfig: this.checkoutProps.writeConfig,
      writePackageJson: !this.checkoutProps.ignorePackageJson,
    });
    await manyComponentsWriter.writeAll();
    await deleteFilesIfNeeded(componentsResults, this.consumer);

    const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

    await this.consumer.onDestroy();

    return { components: appliedVersionComponents, failedComponents };
  }

  private async populateSwitchProps() {
    const lanes = await this.consumer.scope.listLanes();
    const isDefaultLane = this.switchProps.laneName === DEFAULT_LANE;

    const localLane = lanes.find((lane) => lane.name === this.switchProps.laneName);

    if (isDefaultLane || localLane) {
      this.populatePropsAccordingToLocalLane(localLane);
    } else {
      await this.populatePropsAccordingToRemoteLane(lanes);
    }
  }

  private async populatePropsAccordingToRemoteLane(lanes: Lane[]) {
    let remoteLaneId: LaneId;
    try {
      remoteLaneId = LaneId.parse(this.switchProps.laneName);
    } catch (e) {
      throw new GeneralError(
        `invalid lane id "${this.switchProps.laneName}", the lane ${this.switchProps.laneName} doesn't exist.`
      );
    }
    if (remoteLaneId.name === DEFAULT_LANE) {
      throw new BitError(`invalid remote lane id "${this.switchProps.laneName}". to switch to the main lane on remote,
      run "bit switch main" and then "bit import".`);
    }
    // fetch the remote to update all heads
    const localTrackedLane = this.consumer.scope.lanes.getLocalTrackedLaneByRemoteName(
      remoteLaneId.name,
      remoteLaneId.scope as string
    );
    this.logger.debug(`populatePropsAccordingToRemoteLane, remoteLaneId: ${remoteLaneId.toString()}`);
    this.switchProps.localLaneName = this.switchProps.newLaneName || localTrackedLane || remoteLaneId.name;
    if (this.consumer.getCurrentLaneId().name === this.switchProps.localLaneName) {
      throw new BitError(`already checked out to "${this.switchProps.localLaneName}"`);
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(this.consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([remoteLaneId]);
    if (remoteLaneObjects.length === 0) {
      throw new BitError(
        `invalid lane id "${this.switchProps.laneName}", the lane ${this.switchProps.laneName} doesn't exist.`
      );
    }
    if (remoteLaneObjects.length > 1) {
      const allLanes = remoteLaneObjects.map((l) => l.id()).join(', ');
      throw new BitError(`switching to multiple lanes is not supported. got: ${allLanes}`);
    }
    const remoteLane = remoteLaneObjects[0];
    this.switchProps.remoteLaneName = remoteLaneId.name;
    this.switchProps.laneName = remoteLaneId.name;
    this.switchProps.remoteLaneScope = remoteLaneId.scope;
    this.switchProps.remoteScope = remoteLaneId.scope;
    this.switchProps.ids = remoteLane.components.map((l) => l.id.changeVersion(l.head.toString()));
    this.switchProps.localTrackedLane = localTrackedLane || undefined;
    this.switchProps.remoteLane = remoteLane;
    const laneExistsLocally = lanes.find((l) => l.name === this.switchProps.localLaneName);
    if (laneExistsLocally) {
      throw new BitError(`unable to checkout to a remote lane ${this.switchProps.remoteScope}/${this.switchProps.laneName}.
the local lane "${this.switchProps.localLaneName}" already exists, please switch to the local lane first by running "bit switch ${this.switchProps.localLaneName}"
then, to merge the remote lane into the local lane, run "bit lane merge ${this.switchProps.localLaneName} --remote ${this.switchProps.remoteScope}"`);
    }
    this.logger.debug(`populatePropsAccordingToRemoteLane, completed`);
  }

  private populatePropsAccordingToLocalLane(localLane: Lane | undefined) {
    this.switchProps.localLaneName = this.switchProps.laneName;
    if (this.consumer.getCurrentLaneId().name === this.switchProps.laneName) {
      throw new GeneralError(`already checked out to "${this.switchProps.laneName}"`);
    }
    if (this.switchProps.laneName === DEFAULT_LANE) {
      this.switchProps.ids = this.consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
      return;
    }
    if (!localLane) {
      throw new GeneralError(
        `unable to find a local lane "${this.switchProps.laneName}", to create a new lane please run "bit lane create"`
      );
    }
    this.switchProps.ids = localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
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
    const saveRemoteLaneToBitmap = () => {
      if (this.switchProps.remoteLaneScope) {
        this.consumer.bitMap.setRemoteLane(
          LaneId.from(this.switchProps.remoteLaneName as string, this.switchProps.remoteLaneScope)
        );
        // add versions to lane
      }
    };
    const throwIfLaneExists = async () => {
      const allLanes = await this.consumer.scope.listLanes();
      if (allLanes.find((l) => l.name === this.switchProps.localLaneName)) {
        throw new GeneralError(`unable to checkout to lane "${this.switchProps.localLaneName}".
  the lane already exists. please switch to the lane and merge`);
      }
    };

    if (this.switchProps.remoteLane) {
      await throwIfLaneExists();
      await createLane(
        this.consumer,
        this.switchProps.localLaneName as string,
        this.switchProps.remoteLaneScope as string,
        this.switchProps.remoteLane
      );
      if (!this.switchProps.localTrackedLane) {
        this.consumer.scope.lanes.trackLane({
          localLane: this.switchProps.localLaneName as string,
          remoteLane: this.switchProps.remoteLaneName as string,
          remoteScope: this.switchProps.remoteLaneScope as string,
        });
      }
    }

    saveRemoteLaneToBitmap();
    this.consumer.scope.lanes.setCurrentLane(this.switchProps.localLaneName as string);
    const workspaceLane =
      this.switchProps.localLaneName === DEFAULT_LANE
        ? null
        : WorkspaceLane.load(this.switchProps.localLaneName as string, this.consumer.scope.path);
    this.consumer.bitMap.syncWithLanes(workspaceLane);
  }
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
