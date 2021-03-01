import { BitId } from '../../../bit-id';
import BitIds from '../../../bit-id/bit-ids';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_DEPRECATE, BEFORE_REMOTE_UNDEPRECATE } from '../../../cli/loader/loader-messages';
import { Consumer, loadConsumer, loadConsumerIfExist } from '../../../consumer';
import { Remotes } from '../../../remotes';
import {
  deprecateMany,
  deprecateRemote,
  undeprecateMany,
  undeprecateRemote,
} from '../../../scope/component-ops/components-deprecation';
import { getScopeRemotes } from '../../../scope/scope-remotes';

export async function deprecate({ ids, remote }: { ids: string[]; remote: boolean }): Promise<any> {
  if (remote) {
    loader.start(BEFORE_REMOTE_DEPRECATE);
    const consumer = await loadConsumerIfExist();
    const bitIds = getBitIdsForRemote(ids);
    const remotes = await getRemotes(consumer);
    return deprecateRemote(remotes, consumer?.scope, bitIds);
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
    return undeprecateRemote(remotes, consumer?.scope, bitIds);
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
