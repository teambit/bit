// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { removeLocalVersion, removeLocalVersionsForAllComponents } from '../../../scope/component-ops/untag-component';

export async function unTagAction(id: string, version?: string, force: boolean) {
  const consumer: Consumer = await loadConsumer();
  const bitId = BitId.parse(id);

  // a user might run the command `bit untag id@version` instead of `bit untag id version`
  if (bitId.hasVersion() && !version) version = bitId.version;

  const result = await removeLocalVersion(consumer.scope, bitId, version, force);
  return [result];
}

export async function unTagAllAction(version?: string, force: boolean) {
  const consumer: Consumer = await loadConsumer();
  return removeLocalVersionsForAllComponents(consumer.scope, version, force);
}
