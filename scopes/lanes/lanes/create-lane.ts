import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ScopeMain } from '@teambit/scope';
// import { BitIds } from '@teambit/legacy/dist/bit-id';
import Lane, { LaneComponent } from '@teambit/legacy/dist/scope/models/lane';
import { isHash } from '@teambit/component-version';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { Ref } from '@teambit/legacy/dist/scope/objects';

const MAX_LANE_NAME_LENGTH = 800;

export async function createLane(
  consumer: Consumer,
  laneName: string,
  scopeName: string,
  remoteLane?: Lane
): Promise<Lane> {
  const lanes = await consumer.scope.listLanes();
  if (lanes.find((lane) => lane.name === laneName)) {
    throw new BitError(`lane "${laneName}" already exists, to switch to this lane, please use "bit switch" command`);
  }
  throwForInvalidLaneName(laneName);
  await throwForStagedComponents(consumer);
  const getDataToPopulateLaneObjectIfNeeded = async (): Promise<LaneComponent[]> => {
    if (remoteLane) return remoteLane.components;
    // when branching from one lane to another, copy components from the origin lane
    // when branching from main, no need to copy anything
    const currentLaneObject = await consumer.getCurrentLaneObject();
    if (!currentLaneObject) return [];
    const laneComponents = currentLaneObject.components;
    const workspaceIds = consumer.bitMap.getAllBitIds();
    const laneComponentWithBitmapHead = laneComponents.map(({ id, head }) => {
      const bitmapHead = workspaceIds.searchWithoutVersion(id);
      if (bitmapHead && isHash(bitmapHead.version)) {
        return { id, head: Ref.from(bitmapHead.version as string) };
      }
      return { id, head };
    });
    return laneComponentWithBitmapHead;
  };

  const forkedFrom = await getLaneOrigin(consumer);
  const newLane = remoteLane
    ? Lane.from({
        name: laneName,
        hash: remoteLane.hash().toString(),
        log: remoteLane.log,
        scope: remoteLane.scope,
        forkedFrom,
      })
    : Lane.create(laneName, scopeName, forkedFrom);
  const dataToPopulate = await getDataToPopulateLaneObjectIfNeeded();
  newLane.setLaneComponents(dataToPopulate);

  await consumer.scope.lanes.saveLane(newLane);

  return newLane;
}

export async function createLaneInScope(laneName: string, scope: ScopeMain): Promise<Lane> {
  const lanes = await scope.legacyScope.listLanes();
  if (lanes.find((lane) => lane.name === laneName)) {
    throw new BitError(`lane "${laneName}" already exists`);
  }
  throwForInvalidLaneName(laneName);
  const newLane = Lane.create(laneName, scope.name);
  await scope.legacyScope.lanes.saveLane(newLane);
  return newLane;
}

async function getLaneOrigin(consumer: Consumer): Promise<LaneId | undefined> {
  const currentLaneId = consumer.bitMap.laneId;
  if (!currentLaneId) return undefined;
  if (consumer.bitMap.isLaneExported) {
    return currentLaneId;
  }
  // current lane is new.
  const currentLane = await consumer.getCurrentLaneObject();
  return currentLane?.forkedFrom;
}

export function throwForInvalidLaneName(laneName: string) {
  if (!isValidLaneName(laneName)) {
    throw new BitError(
      `lane "${laneName}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}

export async function throwForStagedComponents(consumer: Consumer) {
  const componentList = new ComponentsList(consumer);
  const stagedComponents = await componentList.listExportPendingComponentsIds();
  if (stagedComponents.length) {
    throw new BitError(
      `unable to switch/create a new lane, please export or reset the following components first: ${stagedComponents.join(
        ', '
      )}`
    );
  }
}

function isValidLaneName(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  if (val.length > MAX_LANE_NAME_LENGTH) return false;
  // @todo: should we allow slash? if so, we should probably replace the lane-delimiter with something else. (maybe ":")
  return /^[$\-_!a-z0-9]+$/.test(val);
}
