/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import type { LinksResult } from '../../../links/node-modules-linker';
import { installIds, install } from '../../../consumer/component/install-components';

export default (async function installAction(
  ids: string[],
  verbose: boolean,
  packageManagerArgs: string[]
): Promise<LinksResult[]> {
  const consumer: Consumer = await loadConsumer();
  consumer.packageManagerArgs = packageManagerArgs;
  const installResults = ids.length ? await installIds(consumer, ids, verbose) : await install(consumer, verbose);
  await consumer.onDestroy();
  return installResults;
});
