/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default async function move({ id, from, to }: { id: string, from: string, to: string }) {
  const consumer: Consumer = await loadConsumer();
  const idParsed = BitId.parse(id);
  return consumer.movePaths({ id: idParsed, from, to });
}
