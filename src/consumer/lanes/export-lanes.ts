import R from 'ramda';

import { Consumer } from '..';
import { BitIds } from '../../bit-id';
import loader from '../../cli/loader';
import { BEFORE_LOADING_COMPONENTS } from '../../cli/loader/loader-messages';
import GeneralError from '../../error/general-error';
import LaneId, { RemoteLaneId } from '../../lane-id/lane-id';
import { Lane } from '../../scope/models';
import WorkspaceLane from '../bit-map/workspace-lane';
import ComponentsList from '../component/components-list';

export async function updateLanesAfterExport(consumer: Consumer, lanes: Lane[]) {
  const lanesToUpdate = lanes.filter((l) => l.remoteLaneId);
  // lanes that don't have remoteLaneId should not be updated. it happens when updating to a
  // different remote with no intention to save the remote.
  if (!lanesToUpdate.length) return;
  const currentLane = consumer.getCurrentLaneId();
  const workspaceLanesToUpdate: WorkspaceLane[] = [];
  lanesToUpdate.forEach((lane) => {
    const remoteLaneId = lane.remoteLaneId as RemoteLaneId;
    consumer.scope.lanes.trackLane({
      localLane: lane.name,
      remoteLane: remoteLaneId.name,
      remoteScope: remoteLaneId.scope,
    });
    const isCurrentLane = lane.name === currentLane.name;
    if (isCurrentLane) {
      consumer.bitMap.setRemoteLane(remoteLaneId);
    }
    const workspaceLane = isCurrentLane
      ? (consumer.bitMap.workspaceLane as WorkspaceLane) // bitMap.workspaceLane is empty only when is on master
      : WorkspaceLane.load(lane.name, consumer.scope.path);
    if (!isCurrentLane) workspaceLanesToUpdate.push(workspaceLane);
    consumer.bitMap.updateLanesProperty(workspaceLane, remoteLaneId);
    workspaceLane.reset();
  });
  await Promise.all(workspaceLanesToUpdate.map((l) => l.write()));
}

export async function getLaneCompIdsToExport(
  consumer: Consumer,
  ids: string[],
  includeNonStaged: boolean
): Promise<{ componentsToExport: BitIds; lanesObjects: Lane[] }> {
  const currentLaneId = consumer.getCurrentLaneId();
  const laneIds = ids.length ? ids.map((laneName) => new LaneId({ name: laneName })) : [currentLaneId];
  const nonExistingLanes: string[] = [];
  const lanesObjects: Lane[] = [];
  await Promise.all(
    laneIds.map(async (laneId) => {
      const laneObject = await consumer.scope.loadLane(laneId);
      if (laneObject) {
        lanesObjects.push(laneObject);
      } else if (!laneId.isDefault()) {
        nonExistingLanes.push(laneId.name);
      }
    })
  );
  if (nonExistingLanes.length) {
    throw new GeneralError(
      `unable to export the following lanes ${nonExistingLanes.join(', ')}. they don't exist or are empty`
    );
  }
  loader.start(BEFORE_LOADING_COMPONENTS);
  const componentsList = new ComponentsList(consumer);
  const compsToExportP = lanesObjects.map(async (laneObject: Lane | null) => {
    // null in case of default-lane
    return includeNonStaged
      ? componentsList.listNonNewComponentsIds()
      : componentsList.listExportPendingComponentsIds(laneObject);
  });
  const componentsToExport = BitIds.fromArray(R.flatten(await Promise.all(compsToExportP)));
  return { componentsToExport, lanesObjects };
}

export function isUserTryingToExportLanes(consumer: Consumer, ids: string[], lanes: boolean) {
  if (!ids.length) {
    const currentLaneId = consumer.getCurrentLaneId();
    // if no ids entered, when a user checked out to a lane, we should export the lane
    return !currentLaneId.isDefault();
  }
  return lanes;
}

// leave this here in case we do want to guess whether a user wants to export a lane.
// export async function isUserTryingToExportLanes(consumer: Consumer) {
//   const getLaneNames = async (): Promise<string[]> => {
//     const lanesObj = await consumer.scope.listLanes();
//     const laneNames = lanesObj.map(lane => lane.name);
//     laneNames.push(DEFAULT_LANE);
//     return laneNames;
//   };
//   const laneNames = await getLaneNames();
//   const idsFromWorkspaceAndScope = await componentsList.listAllIdsFromWorkspaceAndScope();
//   const currentLaneId = consumer.getCurrentLaneId();
//   if (lanes) return true;
//   if (!ids.length) {
//     // if no ids entered, when a user checked out to a lane, we should export the lane
//     return !currentLaneId.isDefault();
//   }
//   if (ids.every(id => !laneNames.includes(id))) {
//     // if none of the ids is lane, then user is not trying to export lanes
//     return false;
//   }
//   // some or all ids are lane names, if all are not ids, user is trying to export lanes
//   return ids.every(id => {
//     if (laneNames.includes(id) && idsFromWorkspaceAndScope.hasWithoutScopeAndVersionAsString(id)) {
//       throw new GeneralError(`the id ${id} is both, a component-name and a lane-name`);
//     }
//     return laneNames.includes(id);
//   });
// };
