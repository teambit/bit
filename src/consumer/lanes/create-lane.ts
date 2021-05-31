import { Consumer } from '..';
import { BitIds } from '../../bit-id';
import GeneralError from '../../error/general-error';
import Lane, { LaneComponent } from '../../scope/models/lane';
import WorkspaceLane from '../bit-map/workspace-lane';

export default async function createNewLane(
  consumer: Consumer,
  laneName: string,
  laneComponents?: LaneComponent[]
): Promise<Lane> {
  const lanes = await consumer.scope.listLanes();
  if (lanes.find((lane) => lane.name === laneName)) {
    throw new GeneralError(
      `lane "${laneName}" already exists, to switch to this lane, please use "bit switch" command`
    );
  }
  if (!isValidLaneName(laneName)) {
    throw new GeneralError(
      `lane "${laneName}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }

  const getDataToPopulateLaneObjectIfNeeded = async (): Promise<LaneComponent[]> => {
    if (laneComponents) return laneComponents;
    // when branching from one lane to another, copy components from the origin lane
    // when branching from master, no need to copy anything
    const currentLaneObject = await consumer.getCurrentLaneObject();
    return currentLaneObject ? currentLaneObject.components : [];
  };
  const getDataToPopulateWorkspaceLaneIfNeeded = (): BitIds => {
    if (laneComponents) return new BitIds(); // if laneComponent, this got created when importing a remote lane
    // when branching from one lane to another, copy components from the origin workspace-lane
    // when branching from master, no need to copy anything
    const currentWorkspaceLane = consumer.bitMap.workspaceLane;
    return currentWorkspaceLane ? currentWorkspaceLane.ids : new BitIds();
  };
  const newLane = Lane.create(laneName);
  const dataToPopulate = await getDataToPopulateLaneObjectIfNeeded();
  newLane.setLaneComponents(dataToPopulate);

  await consumer.scope.lanes.saveLane(newLane);

  const workspaceConfig = WorkspaceLane.load(laneName, consumer.scope.getPath());
  workspaceConfig.ids = getDataToPopulateWorkspaceLaneIfNeeded();
  await workspaceConfig.write();

  return newLane;
}

function isValidLaneName(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  // @todo: should we allow slash?
  return /^[$\-_!a-z0-9]+$/.test(val);
}
