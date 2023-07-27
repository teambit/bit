import { Consumer } from '@teambit/legacy/dist/consumer';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { BitId } from '@teambit/legacy-bit-id';
import { ApplyVersionResults } from '@teambit/merging';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { CheckoutPropsLegacy, CheckoutProps } from '@teambit/checkout';
import { Workspace } from '@teambit/workspace';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { LanesMain } from './lanes.main.runtime';
import { throwForStagedComponents } from './create-lane';

export type SwitchProps = {
  laneName: string;
  ids?: BitId[];
  pattern?: string;
  existingOnWorkspaceOnly: boolean;
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
    private checkoutProps: CheckoutPropsLegacy,
    private Lanes: LanesMain
  ) {
    this.consumer = this.workspace.consumer;
  }

  async switch(): Promise<ApplyVersionResults> {
    this.logger.setStatusLine(`switching lanes`);
    if (this.workspace.isOnMain()) {
      await throwForStagedComponents(this.consumer);
    }
    await this.populateSwitchProps();
    const bitMapIds = this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
    const idsToSwitch = this.switchProps.ids || [];
    const idsWithVersion = idsToSwitch.map((id) => {
      const bitMapId = bitMapIds.searchWithoutVersion(id);
      return bitMapId || id;
    });
    const ids = await this.workspace.resolveMultipleComponentIds(idsWithVersion);

    const checkoutProps: CheckoutProps = {
      ...this.checkoutProps,
      ids,
      allowAddingComponentsFromScope: true,
      versionPerId: await this.workspace.resolveMultipleComponentIds(idsToSwitch),
    };

    const results = await this.Lanes.checkout.checkout(checkoutProps);

    await this.saveLanesData();
    await this.consumer.onDestroy();

    return results;
  }

  private async populateSwitchProps() {
    const laneId = await this.consumer.scope.lanes.parseLaneIdFromString(this.switchProps.laneName);

    const localLane = await this.consumer.scope.loadLane(laneId);
    const mainIds = await this.consumer.getIdsOfDefaultLane();
    if (laneId.isDefault()) {
      await this.populatePropsAccordingToDefaultLane();
      this.switchProps.ids = mainIds;
    } else {
      const ids = localLane
        ? this.populatePropsAccordingToLocalLane(localLane)
        : await this.populatePropsAccordingToRemoteLane(laneId);
      this.switchProps.ids = ids;
      mainIds.forEach((id) => {
        if (!ids.find((i) => i.isEqualWithoutVersion(id))) this.switchProps.ids?.push(id);
      });
    }

    if (this.switchProps.pattern) {
      if (this.consumer.bitMap.getAllBitIdsFromAllLanes().length) {
        // if the workspace is not empty, it's possible that it has components from lane-x, and is now switching
        // partially to lane-y, while lane-y has the same components as lane-x. in which case, the user ends up with
        // an invalid state of components from lane-x and lane-y together.
        throw new BitError('error: use --pattern only when the workspace is empty');
      }
      const allIds = await this.workspace.resolveMultipleComponentIds(this.switchProps.ids || []);
      const patternIds = this.workspace.scope.filterIdsFromPoolIdsByPattern(this.switchProps.pattern, allIds);
      this.switchProps.ids = patternIds.map((id) => id._legacy);
    }
  }

  private async populatePropsAccordingToRemoteLane(remoteLaneId: LaneId): Promise<BitId[]> {
    this.laneIdToSwitchTo = remoteLaneId;
    this.logger.debug(`populatePropsAccordingToRemoteLane, remoteLaneId: ${remoteLaneId.toString()}`);
    if (this.consumer.getCurrentLaneId().isEqual(remoteLaneId)) {
      throw new BitError(`already checked out to "${remoteLaneId.toString()}"`);
    }
    const remoteLane = await this.Lanes.fetchLaneWithItsComponents(remoteLaneId);
    this.switchProps.laneName = remoteLaneId.name;
    this.switchProps.localTrackedLane = this.consumer.scope.lanes.getAliasByLaneId(remoteLaneId) || undefined;
    this.switchProps.remoteLane = remoteLane;
    this.laneToSwitchTo = remoteLane;
    this.logger.debug(`populatePropsAccordingToRemoteLane, completed`);
    return remoteLane.components.map((l) => l.id.changeVersion(l.head.toString()));
  }

  private async populatePropsAccordingToDefaultLane() {
    if (this.consumer.isOnMain()) {
      throw new BitError(`already checked out to "${this.switchProps.laneName}"`);
    }
    this.laneIdToSwitchTo = LaneId.from(DEFAULT_LANE, this.consumer.scope.name);
  }

  private populatePropsAccordingToLocalLane(localLane: Lane): BitId[] {
    if (this.consumer.getCurrentLaneId().name === this.switchProps.laneName) {
      throw new BitError(`already checked out to "${this.switchProps.laneName}"`);
    }
    this.laneIdToSwitchTo = localLane.toLaneId();
    this.laneToSwitchTo = localLane;
    return localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
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
    this.consumer.bitMap.syncWithIds(BitIds.fromArray(this.switchProps.ids || []));
  }
}
