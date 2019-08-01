/** @flow */
import R from 'ramda';
import { loadConsumer, loadConsumerIfExist, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOVE } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';
import removeComponents from '../../../consumer/component-ops/remove-components';
import { getRemoteBitIdsByWildcards } from './list-scope';

export default (async function remove({
  ids,
  force,
  remote,
  track,
  deleteFiles
}: {
  ids: string[],
  force: boolean,
  remote: boolean,
  track: boolean,
  deleteFiles: boolean
}): Promise<any> {
  loader.start(BEFORE_REMOVE);
  const consumer: ?Consumer = remote ? await loadConsumerIfExist() : await loadConsumer();
  const bitIds = remote ? await getRemoteBitIdsToRemove(ids) : await getLocalBitIdsToRemove(consumer, ids);
  const removeResults = await removeComponents({
    consumer,
    ids: BitIds.fromArray(bitIds),
    force,
    remote,
    track,
    deleteFiles
  });
  if (consumer) await consumer.onDestroy();
  return removeResults;
});

async function getLocalBitIdsToRemove(consumer: Consumer, ids: string[]): Promise<BitId[]> {
  if (hasWildcard(ids)) {
    const allIds = consumer.bitMap.getAllBitIds();
    const bitIds = ComponentsList.filterComponentsByWildcard(allIds, ids);
    if (!bitIds.length) throw new NoIdMatchWildcard(ids);
    return bitIds;
  }
  return ids.map(id => consumer.getParsedId(id));
}

async function getRemoteBitIdsToRemove(ids: string[]): Promise<BitId[]> {
  if (hasWildcard(ids)) {
    return getIdsFromRemoteByWildcards(ids);
  }
  return ids.map(id => BitId.parse(id, true));
}

async function getIdsFromRemoteByWildcards(ids: string[]): Promise<BitId[]> {
  const remoteIds = await Promise.all(
    ids.map((id) => {
      if (hasWildcard(id)) {
        return getRemoteBitIdsByWildcards(id);
      }
      return BitId.parse(id, true);
    })
  );
  loader.start(BEFORE_REMOVE);
  return R.flatten(remoteIds);
}
