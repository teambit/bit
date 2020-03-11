import { loadConsumer, Consumer } from '../../../consumer';
import { linkAllToNodeModules } from '../../../links';

export default async function linkAction(changeRelativeToModulePaths: boolean) {
  const consumer: Consumer = await loadConsumer();
  const linkResults = await linkAllToNodeModules(consumer, changeRelativeToModulePaths);
  await consumer.onDestroy();
  return linkResults;
}
