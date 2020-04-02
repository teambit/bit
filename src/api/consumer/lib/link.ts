import { loadConsumer, Consumer } from '../../../consumer';
import { linkAllToNodeModules } from '../../../links';
import { changeCodeFromRelativeToModulePaths } from '../../../consumer/component-ops/codemod-components';

export default async function linkAction(changeRelativeToModulePaths: boolean) {
  const consumer: Consumer = await loadConsumer();
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(consumer);
    consumer.componentLoader.clearComponentsCache();
  }
  const linksResults = await linkAllToNodeModules(consumer);
  await consumer.onDestroy();
  return { linksResults, codemodResults };
}
