/** @flow */
import groupArray from 'group-array';
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default (async function deprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  const bitIds = ids.map(bitId => BitId.parse(bitId));
  const consumer = await loadConsumer();
  if (remote) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await consumer.scope.remotes();
    const deprecateP = Object.keys(groupedBitsByScope).map(async (key) => {
      const resolvedRemote = await remotes.resolve(key, consumer.scope);
      const deprecateResult = await resolvedRemote.deprecateMany(groupedBitsByScope[key]);
      return deprecateResult;
    });
    const deprecatedComponentsResult = await Promise.all(deprecateP);
    return deprecatedComponentsResult;
  }

  // local remove in case user wants to delete commited components
  const removedIds = await consumer.scope.deprecateMany(bitIds);
  return removedIds;
});
