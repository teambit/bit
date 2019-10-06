import { loadConsumer, Consumer } from '../../../consumer';
import { linkAllToNodeModules } from '../../../links';
import { LinksResult } from '../../../links/node-modules-linker';

export default (async function linkAction(): Promise<LinksResult[]> {
  const consumer: Consumer = await loadConsumer();
  const linkResults = await linkAllToNodeModules(consumer);
  await consumer.onDestroy();
  return linkResults;
});
