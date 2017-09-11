/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default async function move({ from, to }: { from: string, to: string }) {
  const consumer: Consumer = await loadConsumer();
  return consumer.movePaths({ from, to });
}
