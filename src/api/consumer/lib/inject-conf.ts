import { Consumer, loadConsumer } from '../../../consumer';
import { InjectConfResult } from '../../../consumer/component-ops/inject-conf';
import GeneralError from '../../../error/general-error';

export default (async function injectConf(id: string, force: boolean): Promise<InjectConfResult> {
  if (!id) {
    throw new GeneralError('please specify component id');
  }
  const consumer: Consumer = await loadConsumer();
  const injectResults = await consumer.injectConf(consumer.getParsedId(id), force);
  await consumer.onDestroy();
  return injectResults;
});
