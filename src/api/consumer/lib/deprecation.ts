import { loadConsumer, loadConsumerIfExist, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_DEPRECATE, BEFORE_REMOTE_UNDEPRECATE } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';
import {
  deprecateRemote,
  deprecateMany,
  undeprecateRemote,
  undeprecateMany,
} from '../../../scope/component-ops/components-deprecation';
import { Remotes } from '../../../remotes';
import { getScopeRemotes } from '../../../scope/scope-remotes';
import BitIds from '../../../bit-id/bit-ids';

export async function deprecate({ ids, remote }: { ids: string[]; remote: boolean }): Promise<any> {
  if (remote) {
    loader.start(BEFORE_REMOTE_DEPRECATE);
    const consumer = await loadConsumerIfExist();
    const bitIds = getBitIdsForRemote(ids);
    const remotes = await getRemotes(consumer);
    const scope = consumer ? consumer.scope : null;
    return deprecateRemote(remotes, scope, bitIds);
  }
  const consumer = await loadConsumer();
  const bitIds = getBitIdsForLocal(ids, consumer);
  return deprecateMany(consumer.scope, bitIds);
}

export async function undeprecate({ ids, remote }: { ids: string[]; remote: boolean }): Promise<any> {
  if (remote) {
    loader.start(BEFORE_REMOTE_UNDEPRECATE);
    const consumer = await loadConsumerIfExist();
    const bitIds = getBitIdsForRemote(ids);
    const remotes = await getRemotes(consumer);
    const scope = consumer ? consumer.scope : null;
    return undeprecateRemote(remotes, scope, bitIds);
  }
  const consumer = await loadConsumer();
  const bitIds = getBitIdsForLocal(ids, consumer);
  return undeprecateMany(consumer.scope, bitIds);
}

function getRemotes(consumer: Consumer | null | undefined): Promise<Remotes> {
  return consumer ? getScopeRemotes(consumer.scope) : Remotes.getGlobalRemotes();
}

function getBitIdsForLocal(ids: string[], consumer: Consumer): BitIds {
  return BitIds.fromArray(ids.map((id) => consumer.getParsedId(id)));
}

function getBitIdsForRemote(ids: string[]): BitId[] {
  return ids.map((id) => BitId.parse(id, true));
}
