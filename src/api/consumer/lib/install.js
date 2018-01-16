/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';

export default (async function installAction(verbose: boolean = false): Promise<any> {
  const consumer: Consumer = await loadConsumer();
  return consumer.install(verbose);
});
