/** @flow */
import { loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_DEPRECATE } from '../../../cli/loader/loader-messages';

export default (async function deprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  if (remote) loader.start(BEFORE_REMOTE_DEPRECATE);
  const consumer = await loadConsumer();
  return consumer.deprecate(ids, remote);
});
