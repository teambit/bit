import type { Consumer } from '@teambit/legacy.consumer';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { ApplyVersionResults } from '@teambit/component.modules.merge-helper';
import type { Lane } from '@teambit/objects';
import type { CheckoutProps } from '@teambit/checkout';
import type { Workspace } from '@teambit/workspace';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { throwForStagedComponents } from '@teambit/lanes.modules.create-lane';
import type { LanesMain } from './lanes.main.runtime';

export type SwitchProps = {
  laneName: string;
  ids?: ComponentID[];
  laneBitIds?: ComponentID[]; // only needed for the deprecated onLanesOnly prop. once this prop is removed, this prop can be removed as well.
  pattern?: string;
  head?: boolean;
  existingOnWorkspaceOnly?: boolean;
  remoteLane?: Lane;
  localTrackedLane?: string;
  alias?: string;
};

export class LaneSwitcher {
  private consumer: Consumer;
  private laneIdToSwitchTo: LaneId; // populated by `this.populateSwitchProps()`
  private laneToSwitchTo: Lane | undefined; // populated by `this.populateSwitchProps()`, if default-lane, it's undefined
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private switchProps: SwitchProps,
    private checkoutProps: CheckoutProps,
    private lanes: LanesMain
  ) {
    this.consumer = this.workspace.consumer;
  }

  async switch(): Promise<ApplyVersionResults> {
    this.logger.setStatusLine(`switching lanes`);
    if (this.workspace.isOnMain()) {
      await throwForStagedComponents(this.workspace);
    }
    await this.populateSwitchProps();
    const bitMapIds = this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
    const idsToSwitch = this.switchProps.ids || [];
    const ids = idsToSwitch.map((id) => {
      const bitMapId = bitMapIds.searchWithoutVersion(id);
      return bitMapId || id;
    });

    const checkoutProps: CheckoutProps = {
      ...this.checkoutProps,
      ids,
      allowAddingComponentsFromScope: true,
      versionPerId: await this.workspace.resolveMultipleComponentIds(idsToSwitch),
      lane: this.laneToSwitchTo,
    };

    const results = await this.lanes.checkout.checkout(checkoutProps);

    await this.saveLanesData();
    await this.consumer.onDestroy('lane-switch');

    return results;
  }

  private async populateSwitchProps() {
    const laneId = await this.consumer.scope.lanes.parseLaneIdFromString(this.switchProps.laneName);

    const localLane = await this.consumer.scope.loadLane(laneId);
    const getMainIds = async () => {
      if (this.switchProps.head) {
        const allIds = this.workspace.listIds();
        await this.workspace.scope.legacyScope.scopeImporter.importWithoutDeps(allIds, {
          cache: false,
          ignoreMissingHead: true,
        });
        return this.consumer.getIdsOfDefaultLane();
      }
      const mainIds = await this.consumer.getIdsOfDefaultLane();
      return mainIds;
    };
    const mainIds = await getMainIds();
    if (laneId.isDefault()) {
      await this.populatePropsAccordingToDefaultLane();
      this.switchProps.ids = mainIds;
    } else {
      const laneIds =
        localLane && !this.switchProps.head
          ? this.populatePropsAccordingToLocalLane(localLane)
          : await this.populatePropsAccordingToRemoteLane(laneId);
      const idsOnLaneOnly = laneIds.filter((id) => !mainIds.find((i) => i.isEqualWithoutVersion(id)));
      const idsOnMainOnly = mainIds.filter((id) => !laneIds.find((i) => i.isEqualWithoutVersion(id)));
      this.switchProps.ids = [...idsOnMainOnly, ...laneIds];
      this.switchProps.laneBitIds = idsOnLaneOnly;
    }
    await this.populateIdsAccordingToPattern();
  }

  private async populateIdsAccordingToPattern() {
    if (!this.switchProps.pattern) {
      return;
    }
    if (this.consumer.bitMap.getAllBitIdsFromAllLanes().length) {
      // if the workspace is not empty, it's possible that it has components from lane-x, and is now switching
      // partially to lane-y, while lane-y has the same components as lane-x. in which case, the user ends up with
      // an invalid state of components from lane-x and lane-y together.
      throw new BitError('error: use --pattern only when the workspace is empty');
    }
    const allIds = this.switchProps.ids || [];
    this.switchProps.ids = await this.workspace.filterIdsFromPoolIdsByPattern(this.switchProps.pattern, allIds);
  }

  private async populatePropsAccordingToRemoteLane(remoteLaneId: LaneId): Promise<ComponentID[]> {
    this.laneIdToSwitchTo = remoteLaneId;
    this.logger.debug(`populatePropsAccordingToRemoteLane, remoteLaneId: ${remoteLaneId.toString()}`);
    this.throwForSwitchingToCurrentLane();
    const remoteLane = await this.lanes.fetchLaneWithItsComponents(remoteLaneId);
    this.switchProps.laneName = remoteLaneId.name;
    this.switchProps.localTrackedLane = this.consumer.scope.lanes.getAliasByLaneId(remoteLaneId) || undefined;
    this.switchProps.remoteLane = remoteLane;
    this.laneToSwitchTo = remoteLane;
    this.logger.debug(`populatePropsAccordingToRemoteLane, completed`);
    return remoteLane.components.map((l) => l.id.changeVersion(l.head.toString()));
  }

  private async populatePropsAccordingToDefaultLane() {
    this.laneIdToSwitchTo = LaneId.from(DEFAULT_LANE, this.consumer.scope.name);
    this.throwForSwitchingToCurrentLane();
  }

  private populatePropsAccordingToLocalLane(localLane: Lane): ComponentID[] {
    this.laneIdToSwitchTo = localLane.toLaneId();
    this.laneToSwitchTo = localLane;
    this.throwForSwitchingToCurrentLane();
    return localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
  }

  private throwForSwitchingToCurrentLane() {
    if (this.consumer.getCurrentLaneId().isEqual(this.laneIdToSwitchTo)) {
      const laneIdStr = this.laneIdToSwitchTo.isDefault()
        ? this.laneIdToSwitchTo.name
        : this.laneIdToSwitchTo.toString();
      throw new BitError(`already checked out to "${laneIdStr}".
to be up to date with the remote lane, please run "bit checkout head"`);
    }
  }

  private async saveLanesData() {
    const localLaneName = this.switchProps.alias || this.laneIdToSwitchTo.name;
    if (this.switchProps.remoteLane) {
      if (!this.switchProps.localTrackedLane) {
        this.consumer.scope.lanes.trackLane({
          localLane: localLaneName,
          remoteLane: this.laneIdToSwitchTo.name,
          remoteScope: this.laneIdToSwitchTo.scope,
        });
      }
    }

    this.consumer.setCurrentLane(this.laneIdToSwitchTo, !this.laneToSwitchTo?.isNew);
    this.consumer.bitMap.syncWithIds(
      ComponentIdList.fromArray(this.switchProps.ids || []),
      ComponentIdList.fromArray(this.switchProps.laneBitIds || [])
    );
  }
}
