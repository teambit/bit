import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import { InjectConfResult } from '../../../consumer/component-ops/inject-conf';

export default (async function injectConf(id: string, force: boolean): Promise<InjectConfResult> {
  if (!id) {
    throw new GeneralError('please specify component id');
  }
  const consumer: Consumer = await loadConsumer();
  const injectResults = await consumer.injectConf(consumer.getParsedId(id), force);
  await consumer.onDestroy();
  return injectResults;
});
