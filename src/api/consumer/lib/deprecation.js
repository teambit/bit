/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_DEPRECATE, BEFORE_REMOTE_UNDEPRECATE } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';

export async function deprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  if (remote) loader.start(BEFORE_REMOTE_DEPRECATE);
  const consumer = await loadConsumer();
  const bitIds = getBitIds(ids, remote, consumer);
  return consumer.deprecate(bitIds, remote);
}

export async function undeprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  if (remote) loader.start(BEFORE_REMOTE_UNDEPRECATE);
  const consumer = await loadConsumer();
  const bitIds = getBitIds(ids, remote, consumer);
  return consumer.undeprecate(bitIds, remote);
}

function getBitIds(ids: string[], remote: boolean, consumer: Consumer): BitId[] {
  return ids.map((id) => {
    return remote ? BitId.parse(id, true) : consumer.getParsedId(id);
  });
}
