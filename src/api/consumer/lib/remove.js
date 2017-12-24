/** @flow */
import { loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOVE } from '../../../cli/loader/loader-messages';

export default (async function remove({
  ids,
  force,
  track,
  deleteFiles
}: {
  ids: string[],
  force: boolean,
  track: boolean,
  deleteFiles: boolean
}): Promise<any> {
  loader.start(BEFORE_REMOVE);
  const consumer = await loadConsumer();
  return consumer.remove(ids, force, track, deleteFiles);
});
