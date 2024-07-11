import groupArray from 'group-array';
import { LaneId } from '@teambit/lane-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import enrichContextFromGlobal from '@teambit/legacy/dist/hooks/utils/enrich-context-from-global';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { Http } from '@teambit/legacy/dist/scope/network/http';
import { CENTRAL_BIT_HUB_NAME, CENTRAL_BIT_HUB_URL } from '@teambit/legacy/dist/constants';

export async function removeLanes(consumer: Consumer | undefined, lanes: string[], remote: boolean, force: boolean) {
  if (remote) {
    const remoteLaneIds = lanes.map((lane) => LaneId.parse(lane));
    const results = await removeRemoteLanes(consumer, remoteLaneIds, force);
    const laneResults = results.map((r) => r.removedLanes).flat();
    return { laneResults };
  }
  if (!consumer) throw new Error('consumer must exist for local removal');
  await consumer.scope.lanes.removeLanes(consumer.scope, lanes, force, consumer.getCurrentLaneId().name);

  return { laneResults: lanes };
}

async function removeRemoteLanes(consumer: Consumer | undefined, lanes: LaneId[], force: boolean) {
  const remotes = consumer ? await getScopeRemotes(consumer.scope) : await Remotes.getGlobalRemotes();
  const shouldGoToCentralHub = remotes.shouldGoToCentralHub(lanes.map((lane) => lane.scope));
  if (shouldGoToCentralHub) {
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    return http.deleteViaCentralHub(
      lanes.map((lane) => lane.toString()),
      { force, idsAreLanes: true }
    );
  }
  const context = {};
  enrichContextFromGlobal(context);
  const groupedLanesByScope = groupArray(lanes, 'scope');
  const removeP = Object.keys(groupedLanesByScope).map(async (key) => {
    const resolvedRemote = await remotes.resolve(key, consumer?.scope);
    const idsStr = groupedLanesByScope[key].map((id) => id.toString());
    return resolvedRemote.deleteMany(idsStr, force, context, true);
  });

  return Promise.all(removeP);
}
