/** @flow */
import R from 'ramda';
import groupArray from 'group-array';
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default async function remove({
  ids,
  hard,
  remote,
  force
}: {
  ids: string[],
  hard: boolean,
  remote: boolean,
  force: boolean
}): Promise<any> {
  const bitIds = ids.map(bitId => BitId.parse(bitId));
  const consumer = await loadConsumer();
  if (remote) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await consumer.scope.remotes();
    const removeP = Object.keys(groupedBitsByScope).map(async (key) => {
      const resolvedRemote = await remotes.resolve(key, consumer.scope);
      const result = await resolvedRemote.deleteMany(groupedBitsByScope[key], hard, force);
      return result;
    });
    const removedObj = await Promise.all(removeP);
    return removedObj;
  }

  // local remove in case user wants to delete commited components
  const removedIds = await consumer.scope.removeMany(bitIds, true, force);
  return removedIds;
}
