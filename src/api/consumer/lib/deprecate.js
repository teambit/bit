/** @flow */
import { loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_DEPRECATE } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';

export default (async function deprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  if (remote) loader.start(BEFORE_REMOTE_DEPRECATE);
  const consumer = await loadConsumer();
  const bitIds = ids.map((id) => {
    return remote ? BitId.parse(id, true) : consumer.getParsedId(id);
  });
  return consumer.deprecate(bitIds, remote);
});
