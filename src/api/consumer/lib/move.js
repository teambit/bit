/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { movePaths } from '../../../consumer/component-ops/move-components';

export default (async function move({ from, to }: { from: string, to: string }) {
  const consumer: Consumer = await loadConsumer();
  return movePaths(consumer, { from, to });
});
