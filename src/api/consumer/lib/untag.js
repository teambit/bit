// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export async function unTagAction(id: string, version?: string) {
  const consumer: Consumer = await loadConsumer();
  const bitId = BitId.parse(id);

  const result = await consumer.scope.removeLocalVersion(bitId, version);
  return [result];
}

export async function unTagAllAction(version?: string) {
  const consumer: Consumer = await loadConsumer();
  return consumer.scope.removeLocalVersionsForAllComponents(version);
}
