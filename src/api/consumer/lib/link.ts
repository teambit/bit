import { loadConsumer, Consumer } from '../../../consumer';
import { linkAllToNodeModules } from '../../../links';
import { changeCodeFromRelativeToModulePaths } from '../../../consumer/component-ops/codemod-components';

export default async function linkAction(ids: string[], changeRelativeToModulePaths: boolean) {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => consumer.getParsedId(id));
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(consumer, bitIds);
    consumer.componentLoader.clearComponentsCache();
  }
  const linksResults = await linkAllToNodeModules(consumer, bitIds);
  await consumer.onDestroy();
  return { linksResults, codemodResults };
}
