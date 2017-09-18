/** @flow */
import { loadConsumer } from '../../../consumer';

export default (async function remove({
  ids,
  remote,
  force
}: {
  ids: string[],
  remote: boolean,
  force: boolean
}): Promise<any> {
  const consumer = await loadConsumer();
  return consumer.remove(ids, remote, force);
});
