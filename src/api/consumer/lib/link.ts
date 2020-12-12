import { Consumer, loadConsumer } from '../../../consumer';
import { changeCodeFromRelativeToModulePaths } from '../../../consumer/component-ops/codemod-components';
import { linkAllToNodeModules } from '../../../links';

export default async function linkAction(
  ids: string[],
  changeRelativeToModulePaths: boolean,
  runOnConsumerDestroy = true
) {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map((id) => consumer.getParsedId(id));
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(consumer, bitIds);
  }
  const linksResults = await linkAllToNodeModules(consumer, bitIds);
  if (runOnConsumerDestroy) await consumer.onDestroy();
  return { linksResults, codemodResults };
}
