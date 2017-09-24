/** @flow */
import { loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_REMOVE } from '../../../cli/loader/loader-messages';

export default (async function remove({
  ids,
  remote,
  force,
  track
}: {
  ids: string[],
  remote: boolean,
  force: boolean,
  track: boolean
}): Promise<any> {
  if (remote) loader.start(BEFORE_REMOTE_REMOVE);
  const consumer = await loadConsumer();
  return consumer.remove(ids, remote, force, track);
});
