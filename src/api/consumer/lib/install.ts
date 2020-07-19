import { Consumer, loadConsumer } from '../../../consumer';
import { LinksResult } from '../../../links/node-modules-linker';
import { installIds, install } from '../../../consumer/component-ops/install-components';

export default (async function installAction(
  ids: string[],
  verbose: boolean,
  packageManagerArgs: string[]
): Promise<LinksResult[]> {
  const consumer: Consumer = await loadConsumer();
  consumer.packageManagerArgs = packageManagerArgs;
  const bitIds = ids.map((id) => consumer.getParsedId(id));
  const installResults = ids.length ? await installIds(consumer, bitIds, verbose) : await install(consumer, verbose);
  await consumer.onDestroy();
  return installResults;
});
