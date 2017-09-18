/** @flow */
import { loadConsumer } from '../../../consumer';

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
  const consumer = await loadConsumer();
  return consumer.remove(ids, remote, force, track);
});
