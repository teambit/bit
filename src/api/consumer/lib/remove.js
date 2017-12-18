/** @flow */
import { loadConsumer } from '../../../consumer';
import partition from 'lodash.partition';
import loader from '../../../cli/loader';
import { BEFORE_REMOVE } from '../../../cli/loader/loader-messages';

import { BitId } from '../../../bit-id';

export default (async function remove({
  ids,
  force,
  track
}: {
  ids: string[],
  force: boolean,
  track: boolean
}): Promise<any> {
  loader.start(BEFORE_REMOVE);
  const consumer = await loadConsumer();
  const bitIds = ids.map(bitId => BitId.parse(bitId));
  const [localIds, remoteIds] = partition(bitIds, id => id.isLocal());
  const localResult = await consumer.removeLocal(localIds, force, track);
  const remoteResult = await consumer.removeRemote(remoteIds, force);
  return { localResult, remoteResult };
});
