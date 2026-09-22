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
  skipFetch?: boolean;
  existingOnWorkspaceOnly?: boolean;
  /**
   * switch only the lane components from these scopes. the lane's other components are left
   * untouched: not written to the filesystem, not added to .bitmap, and not reverted to their main
   * version either if this workspace happens to track them. the lane object itself is still fetched
   * and saved whole, so a later snap/export preserves them. (`bit ci sync` mirrors only a lane's
   * own-scope slice into a git repository.)
   */
  restrictToScopes?: string[];
  remoteLane?: Lane;
  localTrackedLane?: string;
  alias?: string;
};

/**
 * Which component ids a switch operates on: the lane's own components, plus the workspace components
 * the lane does not carry (they stay at their main version, as they always have).
 *
 * `restrictToScopes` narrows the lane side to those scopes. Its components are then excluded from
 * BOTH sides - a lane component outside the restriction must not reappear as "main-only", which
 * would check it out at its main version and write it after all. Excluded means untouched.
 */
export function partitionSwitchIds(
  laneIds: ComponentID[],
  mainIds: ComponentID[],
  restrictToScopes?: string[]
): { ids: ComponentID[]; laneBitIds: ComponentID[] } {
  const restricted = restrictToScopes?.length ? laneIds.filter((id) => restrictToScopes.includes(id.scope)) : laneIds;
  const isOnLane = (id: ComponentID) => Boolean(laneIds.find((laneId) => laneId.isEqualWithoutVersion(id)));
  const idsOnLaneOnly = restricted.filter((id) => !mainIds.find((i) => i.isEqualWithoutVersion(id)));
  // Compared against the UNRESTRICTED lane ids on purpose - see the doc comment.
  const idsOnMainOnly = mainIds.filter((id) => !isOnLane(id));
  return { ids: [...idsOnMainOnly, ...restricted], laneBitIds: idsOnLaneOnly };
}

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
    const skipFetch = this.switchProps.skipFetch;

    const localLane = await this.consumer.scope.loadLane(laneId);
    const getMainIds = async () => {
      if (!skipFetch) {
        // fetch by "latest" and without a lane, so the remote resolves each id against the head on
        // main of its original scope. passing the ids as-is would send the versions from .bitmap,
        // which on a lane are snap hashes that live on the lane's scope, not on the component's
        // original scope. the original scope can't resolve them, drops them from the response
        // silently, and the local head on main is left stale.
        const allIds = this.workspace.listIds().toVersionLatest();
        try {
          await this.workspace.scope.legacyScope.scopeImporter.importWithoutDeps(allIds, {
            cache: false,
            ignoreMissingHead: true,
          });
        } catch (err: any) {
          this.logger.consoleWarning(
            `failed to fetch the latest from the remote, falling back to local state. ${err.message}\nuse --skip-fetch to skip this step.`
          );
        }
      }
      return this.consumer.getIdsOfDefaultLane();
    };
    const mainIds = await getMainIds();
    if (laneId.isDefault()) {
      await this.populatePropsAccordingToDefaultLane();
      this.switchProps.ids = mainIds;
    } else {
      let laneIds: ComponentID[];
      if (skipFetch) {
        if (!localLane) {
          throw new BitError(
            `unable to switch to lane "${laneId.toString()}" with --skip-fetch: the lane doesn't exist in the local scope. run without --skip-fetch to fetch it from the remote.`
          );
        }
        laneIds = this.populatePropsAccordingToLocalLane(localLane);
      } else {
        try {
          laneIds = await this.populatePropsAccordingToRemoteLane(laneId);
        } catch (err: any) {
          if (!localLane) throw err;
          this.logger.consoleWarning(
            `failed to fetch lane "${laneId.toString()}" from the remote, falling back to local state. ${err.message}\nuse --skip-fetch to skip this step.`
          );
          laneIds = this.populatePropsAccordingToLocalLane(localLane);
        }
      }
      const { ids, laneBitIds } = partitionSwitchIds(laneIds, mainIds, this.switchProps.restrictToScopes);
      this.switchProps.ids = ids;
      this.switchProps.laneBitIds = laneBitIds;
    }
    await this.populateIdsAccordingToPattern();
    this.filterIdsNotInWorkspaceIfNeeded();
  }

  /**
   * `--workspace-only`: switch only the components the workspace already tracks. a lane can carry
   * components this workspace doesn't have - e.g. one that was removed from the source after it was
   * snapped onto the lane - and checking those out would write them back into .bitmap and to the
   * filesystem. this flag is how a caller says "move the lane pointer, leave my working tree as is"
   * (`bit ci pr` relies on it: the git checkout is the source of truth there).
   */
  private filterIdsNotInWorkspaceIfNeeded() {
    if (!this.switchProps.existingOnWorkspaceOnly) return;
    const bitMapIds = this.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
    const isInWorkspace = (id: ComponentID) => Boolean(bitMapIds.searchWithoutVersion(id));
    this.switchProps.ids = (this.switchProps.ids || []).filter(isInWorkspace);
    this.switchProps.laneBitIds = (this.switchProps.laneBitIds || []).filter(isInWorkspace);
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
    return [...remoteLane.toComponentIds()];
  }

  private async populatePropsAccordingToDefaultLane() {
    this.laneIdToSwitchTo = LaneId.from(DEFAULT_LANE, this.consumer.scope.name);
    this.throwForSwitchingToCurrentLane();
  }

  private populatePropsAccordingToLocalLane(localLane: Lane): ComponentID[] {
    this.laneIdToSwitchTo = localLane.toLaneId();
    this.laneToSwitchTo = localLane;
    this.throwForSwitchingToCurrentLane();
    return [...localLane.toComponentIds()];
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

    // If this cache isn't cleared, here's what can happen:
    // Switching from "lane-dev" to "main": while on "lane-dev", ModelComponent keeps in-memory props
    // `laneHeadLocal` and `laneHeadRemote`. Methods like `headIncludeRemote()` use them and may return
    // the lane-dev head instead of the head on main.
    this.consumer.scope.objects.clearObjectsFromCache();
  }
}
