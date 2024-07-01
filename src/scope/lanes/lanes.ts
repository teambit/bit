import { BitError } from '@teambit/bit-error';
import { LaneId, DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { ComponentID } from '@teambit/component-id';
import { Scope } from '..';
import { LaneNotFound } from '@teambit/legacy.scope-api';
import logger from '../../logger/logger';
import { Lane, LaneHistory, Version } from '../models';
import { BitObject, Repository } from '../objects';
import { IndexType, LaneItem } from '../objects/scope-index';
import { ScopeJson, TrackLane } from '../scope-json';
import { LaneComponent, Log } from '../models/lane';
import { pMapPool } from '../../utils/promise-with-concurrent';

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

  /** don't use it outside of Lanes. Use scope.loadLane instead */
  async loadLane(id: LaneId): Promise<Lane | undefined> {
    if (id.isDefault()) return undefined; // main lane is not saved
    const filter = (lane: LaneItem) => lane.toLaneId().isEqual(id);
    const hash = this.objects.getHashFromIndex(IndexType.lanes, filter);
    if (!hash) return undefined;
    // this makes sure to delete index.json in case it's outdated
    const obj = await this.objects._getBitObjectsByHashes([hash]);
    const lane = obj[0] as Lane;
    lane.isNew = Boolean(this.scopeJson.lanes.new?.find((l) => l === lane.name));
    return lane;
  }

  async getOrCreateLaneHistory(laneObject: Lane): Promise<LaneHistory> {
    const emptyLaneHistory = LaneHistory.fromLaneObject(laneObject);
    const existingLaneHistory = (await this.objects.load(emptyLaneHistory.hash(), false)) as LaneHistory;
    return existingLaneHistory || emptyLaneHistory;
  }

  async updateLaneHistory(laneObject: Lane, laneHistoryMsg?: string) {
    const laneHistory = await this.getOrCreateLaneHistory(laneObject);
    await laneHistory.addHistory(laneObject, laneHistoryMsg);
    return laneHistory;
  }

  async saveLane(
    laneObject: Lane,
    { saveLaneHistory = true, laneHistoryMsg }: { saveLaneHistory?: boolean; laneHistoryMsg?: string }
  ) {
    if (!laneObject.hasChanged) {
      logger.debug(`lanes, saveLane, no need to save the lane "${laneObject.name}" as it has not changed`);
      return;
    }
    const objectsToSave: BitObject[] = [laneObject];
    if (saveLaneHistory) {
      const laneHistory = await this.updateLaneHistory(laneObject, laneHistoryMsg);
      objectsToSave.push(laneHistory);
    }
    await this.objects.writeObjectsToTheFS(objectsToSave);
    laneObject.hasChanged = false;
  }

  async renameLane(lane: Lane, newName: string) {
    // change tracking data
    const oldName = lane.name;
    const afterTrackData = {
      localLane: newName,
      remoteLane: newName,
      remoteScope: lane.scope,
    };
    this.trackLane(afterTrackData);
    this.removeTrackLane(oldName);

    // rename the lane in the "new" prop
    if (lane.isNew) {
      this.scopeJson.lanes.new = this.scopeJson.lanes.new.map((l) => (l === oldName ? newName : l));
    }

    // change the lane object
    lane.changeName(newName);
    await this.saveLane(lane, { laneHistoryMsg: `rename lane from "${oldName}" to "${newName}"` });
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

    const lanesToRemove: Lane[] = await Promise.all(
      lanes.map(async (laneName) => {
        if (laneName === DEFAULT_LANE) throw new BitError(`unable to remove the default lane "${DEFAULT_LANE}"`);
        if (laneName === currentLaneName) throw new BitError(`unable to remove the currently used lane "${laneName}"`);
        const laneId = await this.parseLaneIdFromString(laneName);
        const existingLane = existingLanes.find((l) => l.toLaneId().isEqual(laneId));
        if (!existingLane) throw new LaneNotFound(scope.name, laneName);
        return existingLane;
      })
    );

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
    await this.objects.moveObjectsToTrash(lanesToRemove.map((l) => l.hash()));

    // const compIdsFromDeletedLanes = ComponentIdList.uniqFromArray(lanesToRemove.map((l) => l.toBitIds()).flat());
    // const notDeletedLanes = existingLanes.filter((l) => !lanes.includes(l.name));
    // const compIdsFromNonDeletedLanes = ComponentIdList.uniqFromArray(notDeletedLanes.map((l) => l.toBitIds()).flat());
    // const pendingDeleteCompIds = compIdsFromDeletedLanes.filter(
    //   (id) => !compIdsFromNonDeletedLanes.hasWithoutVersion(id)
    // );
    // const modelComponents = await Promise.all(pendingDeleteCompIds.map((id) => scope.getModelComponentIfExist(id)));
    // const modelComponentsWithoutHead = compact(modelComponents).filter((comp) => !comp.hasHead());
    // if (modelComponentsWithoutHead.length) {
    //   const idsStr = modelComponentsWithoutHead.map((comp) => comp.id()).join(', ');
    //   logger.debug(`lanes, deleting the following orphaned components: ${idsStr}`);
    //   await this.objects.deleteObjectsFromFS(modelComponentsWithoutHead.map((comp) => comp.hash()));
    // }

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
      throw new LaneNotFound('', name);
    }
    if (foundWithSameName.length > 1) {
      throw new BitError(
        `found more than one lane with the name "${name}", please specify the scope in a form of "<scope>${LANE_REMOTE_DELIMITER}<name>"`
      );
    }
    return foundWithSameName[0].toLaneId();
  }

  async getLanesData(scope: Scope, name?: string, mergeData = false, includeDeleted = false): Promise<LaneData[]> {
    const getLaneDataOfLane = async (laneObject: Lane): Promise<LaneData> => {
      const laneName = laneObject.name;
      const alias = this.getLocalTrackedLaneByRemoteName(laneName, laneObject.scope);
      const filterDeletedComponents = async () => {
        const format = (c: LaneComponent) => ({ id: c.id, head: c.head.toString() });
        if (includeDeleted) {
          return laneObject.components.map(format);
        }
        if (laneObject.includeDeletedData()) {
          return laneObject.components.filter((c) => !c.isDeleted).map(format);
        }
        // migrate the object to include the deleted data
        let foundErrors = false;
        const comps = await pMapPool(
          laneObject.components,
          async ({ id, head, isDeleted }) => {
            if (isDeleted) return format({ id, head });
            let versionObj: Version;
            try {
              const modelComponent = await scope.getModelComponent(id);
              versionObj = await modelComponent.loadVersion(head.toString(), scope.objects);
            } catch (err) {
              foundErrors = true;
              logger.warn(
                `getLanesData: failed loading version ${head.toString()} of ${id.toString()} in lane ${laneName}, error: ${err}`
              );
              return format({ id, head });
            }
            const isRemoved = versionObj.isRemoved();
            if (isRemoved) {
              laneObject.addComponent({ id, head, isDeleted: true });
            }
            return format({ id, head });
          },
          { concurrency: 50 }
        );
        if (!foundErrors) {
          laneObject.setSchemaToSupportDeletedData();
          await this.saveLane(laneObject, { laneHistoryMsg: 'migrate lane to support including deleted data' });
        }
        return comps;
      };
      return {
        name: laneName,
        remote: laneObject.toLaneId().toString(),
        id: laneObject.toLaneId(),
        alias: alias !== laneName ? alias : null,
        components: await filterDeletedComponents(),
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
    const lanes: LaneData[] = await pMapPool(lanesObjects, (laneObject: Lane) => getLaneDataOfLane(laneObject), {
      concurrency: 10,
    });

    return lanes;
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
  components: Array<{ id: ComponentID; head: string }>;
  isMerged: boolean | null;
  readmeComponent?: { id: ComponentID; head?: string };
  log?: Log;
  hash: string;
};

export function serializeLaneData(laneData: LaneData) {
  return {
    ...laneData,
    components: laneData.components.map((c) => ({ id: c.id.toString(), head: c.head })),
    readmeComponent: laneData.readmeComponent && {
      id: laneData.readmeComponent.id.toString(),
      head: laneData.readmeComponent.head,
    },
  };
}
