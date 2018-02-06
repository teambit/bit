/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export async function unTagAction(id: string, version: string) {
  const consumer: Consumer = await loadConsumer();
  const bitId = BitId.parse(id);
  if (version) {
    bitId.version = version;
  }
  const result = await consumer.removeTag(bitId);
  return [result];
}

export async function unTagAllAction(version: string) {}
