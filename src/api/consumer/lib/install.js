/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import type { LinksResult } from '../../../links/node-modules-linker';
import { installIds, install } from '../../../consumer/component/install-components';

export default (async function installAction(ids: string[], verbose?: boolean = false): Promise<LinksResult[]> {
  const consumer: Consumer = await loadConsumer();
  if (ids.length) return installIds(consumer, ids, verbose);
  return install(consumer, verbose);
});
