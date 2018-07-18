/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOVE } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';

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
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map((id) => {
    return remote ? BitId.parse(id, true) : consumer.getBitId(id);
  });
  const removeResults = await consumer.remove({ ids: BitIds.fromArray(bitIds), force, remote, track, deleteFiles });
  await consumer.onDestroy();
  return removeResults;
});
