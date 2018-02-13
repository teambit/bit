/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import type { LinksResult } from '../../../links/node-modules-linker';

export default (async function installAction(verbose: boolean = false): Promise<LinksResult[]> {
  const consumer: Consumer = await loadConsumer();
  return consumer.install(verbose);
});
