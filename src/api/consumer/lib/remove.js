/** @flow */
import { loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_REMOVE } from '../../../cli/loader/loader-messages';

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
  // loader.start(BEFORE_REMOTE_REMOVE);
  const consumer = await loadConsumer();
  const bitIds = ids.map(bitId => BitId.parse(bitId));
  const localIds = [],
    remoteIds = [];
  bitIds.forEach(x => (x.isLocal() ? localIds.push(x) : remoteIds.push(x)));
  // return  consumer.removeRemote(remoteIds, force)
  return consumer.removeLocal(bitIds, force, track); // //:
});
