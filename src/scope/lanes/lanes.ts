import { BitError } from '@teambit/bit-error';
import { compact } from 'lodash';
import { LaneId, DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { Scope } from '..';
import { LaneNotFound } from '../../api/scope/lib/exceptions/lane-not-found';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { Lane } from '../models';
import { Repository } from '../objects';
import { IndexType, LaneItem } from '../objects/components-index';
import { ScopeJson, TrackLane } from '../scope-json';
import { Log } from '../models/lane';

export default class Lanes {
  objects: Repository;
  scopeJson: ScopeJson;
  constructor(objects: Repository, scopeJson: ScopeJson) {
    this.objects = objects;
    this.scopeJson = scopeJson;
  }

  async listLanes(): Promise<Lane[]> {
    return this.listLanesBackwardCompatible();

    // @todo: remove the above after all the lanes are migrated to the new format (2022-06-01 will be a good time to do so)
    return (await this.objects.listObjectsFromIndex(IndexType.lanes)) as Lane[];
  }

  /** don't use it outside of Lanes. Use scope.loadLane instead */
  async loadLane(id: LaneId): Promise<Lane | null> {
    if (id.isDefault()) return null; // main lane is not saved
    const filter = (lane: LaneItem) => lane.toLaneId().isEqual(id);
    const hash = this.objects.getHashFromIndex(IndexType.lanes, filter);
    if (!hash) return null;
    // this makes sure to delete index.json in case it's outdated
    const obj = await this.objects._getBitObjectsByHashes([hash]);
    const lane = obj[0] as Lane;
    lane.isNew = Boolean(this.scopeJson.lanes.new?.find((l) => l === lane.name));
    return lane;
  }

  async saveLane(laneObject: Lane) {
    await this.objects.writeObjectsToTheFS([laneObject]);
  }

  getAliasByLaneId(laneId: LaneId): string | null {
    return this.getLocalTrackedLaneByRemoteName(laneId.name, laneId.scope);
  }

  getDefaultLaneId() {
    return LaneId.from(DEFAULT_LANE, this.scopeJson.name);
  }

  getLocalTrackedLaneByRemoteName(remoteLane: string, remoteScope: string): string | null {
    const trackedLane = this.scopeJson.lanes.tracking.find(
      (t) => t.remoteLane === remoteLane && t.remoteScope === remoteScope
    );
    return trackedLane ? trackedLane.localLane : null;
  }

  getRemoteScopeByLocalLane(localLane: string): string | null {
    const trackedLane = this.scopeJson.lanes.tracking.find((t) => t.localLane === localLane);
    return trackedLane ? trackedLane.remoteScope : null;
  }

  getRemoteTrackedDataByLocalLane(localLane: string): TrackLane | undefined {
    return this.scopeJson.lanes.tracking.find((t) => t.localLane === localLane);
  }

  trackLane(trackLaneData: TrackLane) {
    this.scopeJson.trackLane(trackLaneData);
  }
  removeTrackLane(localLane: string) {
    this.scopeJson.removeTrackLane(localLane);
  }

  async removeLanes(scope: Scope, lanes: string[], force: boolean, currentLaneName?: string): Promise<string[]> {
    const existingLanes = await this.listLanes();
    const lanesToRemove: Lane[] = lanes.map((laneName) => {
      if (laneName === DEFAULT_LANE) throw new BitError(`unable to remove the default lane "${DEFAULT_LANE}"`);
      if (laneName === currentLaneName) throw new BitError(`unable to remove the currently used lane "${laneName}"`);
      const existingLane = existingLanes.find((l) => l.name === laneName);
      if (!existingLane) throw new LaneNotFound(scope.name, laneName);
      return existingLane;
    });
    if (!force) {
      await Promise.all(
        lanesToRemove.map(async (laneObj) => {
          const isFullyMerged = await laneObj.isFullyMerged(scope);
          if (!isFullyMerged) {
            throw new BitError(
              `unable to remove ${laneObj.name} lane, it is not fully merged. to disregard this error, please use --force flag`
            );
          }
        })
      );
    }
    await this.objects.deleteObjectsFromFS(lanesToRemove.map((l) => l.hash()));

    const compIdsFromDeletedLanes = BitIds.uniqFromArray(lanesToRemove.map((l) => l.toBitIds()).flat());
    const notDeletedLanes = existingLanes.filter((l) => !lanes.includes(l.name));
    const compIdsFromNonDeletedLanes = BitIds.uniqFromArray(notDeletedLanes.map((l) => l.toBitIds()).flat());
    const pendingDeleteCompIds = compIdsFromDeletedLanes.filter(
      (id) => !compIdsFromNonDeletedLanes.hasWithoutVersion(id)
    );
    const modelComponents = await Promise.all(pendingDeleteCompIds.map((id) => scope.getModelComponentIfExist(id)));
    const modelComponentsWithoutHead = compact(modelComponents).filter((comp) => !comp.hasHead());
    if (modelComponentsWithoutHead.length) {
      const idsStr = modelComponentsWithoutHead.map((comp) => comp.id()).join(', ');
      logger.debug(`lanes, deleting the following orphaned components: ${idsStr}`);
      await this.objects.deleteObjectsFromFS(modelComponentsWithoutHead.map((comp) => comp.hash()));
    }

    return lanes;
  }

  /**
   * the name can be a full lane-id or only the lane-name, which can be the alias (local-lane) or the remote-name.
   */
  async parseLaneIdFromString(name: string): Promise<LaneId> {
    if (name.includes(LANE_REMOTE_DELIMITER)) {
      return LaneId.parse(name);
    }
    // the name is only the lane-name without the scope. search for lanes with the same name
    if (name === DEFAULT_LANE) {
      return LaneId.from(DEFAULT_LANE, this.scopeJson.name);
    }
    const trackedData = this.getRemoteTrackedDataByLocalLane(name);
    if (trackedData) {
      return LaneId.from(trackedData.remoteLane, trackedData.remoteScope);
    }

    const allLanes = await this.listLanes();
    const foundWithSameName = allLanes.filter((lane) => lane.name === name);
    if (foundWithSameName.length === 0) {
      throw new BitError(`unable to find a lane with the name "${name}"`);
    }
    if (foundWithSameName.length > 1) {
      throw new BitError(
        `found more than one lane with the name "${name}", please specify the scope in a form of "<scope>${LANE_REMOTE_DELIMITER}<name>"`
      );
    }
    return foundWithSameName[0].toLaneId();
  }

  async getLanesData(scope: Scope, name?: string, mergeData?: boolean): Promise<LaneData[]> {
    const getLaneDataOfLane = async (laneObject: Lane): Promise<LaneData> => {
      const laneName = laneObject.name;
      const alias = this.getLocalTrackedLaneByRemoteName(laneName, laneObject.scope);
      return {
        name: laneName,
        remote: laneObject.toLaneId().toString(),
        id: laneObject.toLaneId(),
        alias: alias !== laneName ? alias : null,
        components: laneObject.components.map((c) => ({ id: c.id, head: c.head.toString() })),
        log: laneObject.log,
        isMerged: mergeData ? await laneObject.isFullyMerged(scope) : null,
        readmeComponent: laneObject.readmeComponent && {
          id: laneObject.readmeComponent.id,
          head: laneObject.readmeComponent.head?.toString(),
        },
        hash: laneObject.hash().toString(),
      };
    };
    if (name) {
      const laneId = await this.parseLaneIdFromString(name);
      const laneObject = await this.loadLane(laneId);
      if (!laneObject) throw new BitError(`lane "${name}" was not found`);
      return [await getLaneDataOfLane(laneObject)];
    }

    const lanesObjects = await this.listLanes();
    const lanes: LaneData[] = await Promise.all(lanesObjects.map((laneObject: Lane) => getLaneDataOfLane(laneObject)));

    return lanes;
  }

  private async listLanesBackwardCompatible(): Promise<Lane[]> {
    const lanes = (await this.objects.listObjectsFromIndex(IndexType.lanes)) as Lane[];
    const oldLanes = lanes.filter((lane) => !lane.scope);
    if (oldLanes.length) await this.fixOldLanesToIncludeScope(oldLanes);
    return lanes;
  }

  private async fixOldLanesToIncludeScope(lanes: Lane[]) {
    logger.warn(`lanes, fixOldLanesToIncludeScope: ${lanes.map((l) => l.id.toString()).join(', ')}`);
    lanes.forEach((lane) => {
      const trackLaneData = this.getRemoteTrackedDataByLocalLane(lane.name);
      if (trackLaneData) {
        lane.scope = trackLaneData.remoteScope;
      } else {
        lane.scope = this.scopeJson.name;
      }
    });
    await this.objects.deleteObjectsFromFS(lanes.map((l) => l.hash()));
    await this.objects.writeObjectsToTheFS(lanes);
  }
}

export type LaneData = {
  /**
   * @deprecated use id.name instead
   */
  name: string;
  /**
   * @deprecated use id.toString() instead
   */
  remote: string | null;
  id: LaneId;
  alias?: string | null;
  components: Array<{ id: BitId; head: string }>;
  isMerged: boolean | null;
  readmeComponent?: { id: BitId; head?: string };
  log?: Log;
  hash: string;
};
