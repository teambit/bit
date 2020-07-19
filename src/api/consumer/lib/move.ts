import { loadConsumer, Consumer } from '../../../consumer';
import { movePaths, moveExistingComponentFilesToOneDir } from '../../../consumer/component-ops/move-components';
import { PathChangeResult } from '../../../consumer/bit-map/bit-map';

export default (async function move({
  from,
  to,
  component,
}: {
  from: string;
  to: string;
  component: boolean;
}): Promise<PathChangeResult[]> {
  const consumer: Consumer = await loadConsumer();
  let moveResults;
  if (component) {
    const id = consumer.getParsedId(from);
    moveResults = await moveExistingComponentFilesToOneDir(consumer, id, to);
  } else {
    moveResults = await movePaths(consumer, { from, to });
  }
  await consumer.onDestroy();
  return moveResults;
});
