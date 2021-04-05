import groupArray from 'group-array';
import R from 'ramda';

import { Consumer } from '..';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { RemoteLaneId } from '../../lane-id/lane-id';
import { Remotes } from '../../remotes';
import { getScopeRemotes } from '../../scope/scope-remotes';
import WorkspaceLane from '../bit-map/workspace-lane';

export default async function removeLanes(
  consumer: Consumer | undefined,
  lanes: string[],
  remote: boolean,
  force: boolean
) {
  if (remote) {
    const remoteLaneIds = lanes.map((lane) => RemoteLaneId.parse(lane));
    const results = await removeRemoteLanes(consumer, remoteLaneIds, force);
    const laneResults = R.flatten(results.map((r) => r.removedLanes));
    return { laneResults };
  }
  if (!consumer) throw new Error('consumer must exist for local removal');
  await consumer.scope.lanes.removeLanes(consumer.scope, lanes, force);
  const workspaceLanes = lanes.map((lane) => WorkspaceLane.load(lane, consumer.scope.path));
  workspaceLanes.forEach((workspaceLane) => workspaceLane.reset());
  await Promise.all(workspaceLanes.map((workspaceLane) => workspaceLane.write()));
  return { laneResults: lanes };
}

async function removeRemoteLanes(consumer: Consumer | undefined, lanes: RemoteLaneId[], force: boolean) {
  const groupedLanesByScope = groupArray(lanes, 'scope');
  const remotes = consumer ? await getScopeRemotes(consumer.scope) : await Remotes.getGlobalRemotes();
  const context = {};
  enrichContextFromGlobal(context);
  const removeP = Object.keys(groupedLanesByScope).map(async (key) => {
    const resolvedRemote = await remotes.resolve(key, consumer?.scope);
    const idsStr = groupedLanesByScope[key].map((id) => id.name);
    return resolvedRemote.deleteMany(idsStr, force, context, true);
  });

  return Promise.all(removeP);
}
