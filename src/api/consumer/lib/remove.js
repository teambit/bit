/** @flow */
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
}): Promise<boolean> {
  const bitIds = ids.map(bitId => BitId.parse(bitId));
  const consumer = await loadConsumer();
  if (remote) {
    const remotes = await consumer.scope.remotes();
    const removeP = bitIds.map(async (bitId) => {
      const resolvedRemote = await remotes.resolve(bitId.scope, consumer.scope);
      return resolvedRemote.deleteMany(ids.join(' '));
    });
    const removedIds = await Promise.all(removeP);
    return removedIds.reduce((a, b) => a.concat(b), []);
  }
  const removedIds = await consumer.scope.remove({ bitIds, hard, force });
  return removedIds;
}
