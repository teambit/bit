// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export async function unTagAction(id: string, version?: string, force: boolean) {
  const consumer: Consumer = await loadConsumer();
  const bitId = BitId.parse(id);

  const result = await consumer.scope.removeLocalVersion(bitId, version, force);
  return [result];
}

export async function unTagAllAction(version?: string, force: boolean) {
  const consumer: Consumer = await loadConsumer();
  return consumer.scope.removeLocalVersionsForAllComponents(version, force);
}
