import { Scope } from '..';
import { BitId } from '../../bit-id';
import { DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '../../constants';
import GeneralError from '../../error/general-error';
import LaneId, { LocalLaneId } from '../../lane-id/lane-id';
import { Lane } from '../models';
import { Ref, Repository } from '../objects';
import { IndexType, LaneItem } from '../objects/components-index';
import { ScopeJson, TrackLane } from '../scope-json';

export default class Lanes {
  objects: Repository;
  scopeJson: ScopeJson;
  constructor(objects: Repository, scopeJson: ScopeJson) {
    this.objects = objects;
    this.scopeJson = scopeJson;
  }

  async listLanes(): Promise<Lane[]> {
    return (await this.objects.listObjectsFromIndex(IndexType.lanes)) as Lane[];
  }

  async loadLane(id: LaneId): Promise<Lane | null> {
    if (id.isDefault()) return null; // master lane is not saved
    const filter = (lane: LaneItem) => lane.toLaneId().isEqual(id);
    const hash = this.objects.getHashFromIndex(IndexType.lanes, filter);
    if (!hash) return null;
    return (await this.objects.load(new Ref(hash))) as Lane;
  }

  async saveLane(laneObject: Lane) {
    await this.objects.writeObjectsToTheFS([laneObject]);
  }

  getCurrentLaneName(): string {
    return this.scopeJson.lanes.current;
  }

  async getCurrentLaneObject(): Promise<Lane | null> {
    return this.loadLane(LocalLaneId.from(this.getCurrentLaneName() || DEFAULT_LANE));
  }

  setCurrentLane(laneName: string): void {
    this.scopeJson.setCurrentLane(laneName);
  }

  getLocalTrackedLaneByRemoteName(remoteLane: string, remoteScope: string): string | null {
    const trackedLane = this.scopeJson.lanes.tracking.find(
      (t) => t.remoteLane === remoteLane && t.remoteScope === remoteScope
    );
    return trackedLane ? trackedLane.localLane : null;
  }

  getRemoteTrackedDataByLocalLane(localLane: string): TrackLane | undefined {
    return this.scopeJson.lanes.tracking.find((t) => t.localLane === localLane);
  }

  trackLane(trackLaneData: TrackLane) {
    this.scopeJson.trackLane(trackLaneData);
  }

  async removeLanes(scope: Scope, lanes: string[], force: boolean): Promise<string[]> {
    const existingLanes = await this.listLanes();
    const lanesToRemove: Lane[] = lanes.map((laneName) => {
      if (laneName === DEFAULT_LANE) throw new GeneralError(`unable to remove the default lane "${DEFAULT_LANE}"`);
      if (laneName === this.getCurrentLaneName())
        throw new GeneralError(`unable to remove the currently used lane "${laneName}"`);
      const existingLane = existingLanes.find((l) => l.name === laneName);
      if (!existingLane) throw new GeneralError(`lane ${laneName} was not found in scope`);
      return existingLane;
    });
    if (!force) {
      await Promise.all(
        lanesToRemove.map(async (laneObj) => {
          const isFullyMerged = await laneObj.isFullyMerged(scope);
          if (!isFullyMerged) {
            // @todo: this error comes pretty ugly to the client when removing from a lane from remote using ssh
            throw new GeneralError(
              `unable to remove ${laneObj.name} lane, it is not fully merged. to disregard this error, please use --force flag`
            );
          }
        })
      );
    }
    await this.objects.deleteObjectsFromFS(lanesToRemove.map((l) => l.hash()));
    return lanes;
  }

  async getLanesData(scope: Scope, name?: string, mergeData?: boolean): Promise<LaneData[]> {
    const getLaneDataOfLane = async (laneObject: Lane): Promise<LaneData> => {
      const laneName = laneObject.name;
      const trackingData = this.getRemoteTrackedDataByLocalLane(laneName);
      return {
        name: laneName,
        remote: trackingData ? `${trackingData.remoteScope}${LANE_REMOTE_DELIMITER}${trackingData.remoteLane}` : null,
        components: laneObject.components.map((c) => ({ id: c.id, head: c.head.toString() })),
        isMerged: mergeData ? await laneObject.isFullyMerged(scope) : null,
      };
    };
    if (name) {
      const laneObject = await this.loadLane(LaneId.from(name));
      if (!laneObject) throw new GeneralError(`lane "${name}" was not found`);
      return [await getLaneDataOfLane(laneObject)];
    }

    const lanesObjects = await this.listLanes();
    const lanes: LaneData[] = await Promise.all(lanesObjects.map((laneObject: Lane) => getLaneDataOfLane(laneObject)));

    return lanes;
  }
}

export type LaneData = {
  name: string;
  components: Array<{ id: BitId; head: string }>;
  remote: string | null;
  isMerged: boolean | null;
};
