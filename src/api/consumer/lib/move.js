/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function move({ from, to }: { from: string, to: string }) {
  const consumer: Consumer = await loadConsumer();
  return consumer.movePaths({ from, to });
});
