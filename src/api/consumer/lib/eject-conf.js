/** @flow */

import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import ejectConfForComponents from '../../../consumer/component-ops/eject-conf';
import type { EjectConfResult } from '../../../consumer/component-ops/eject-conf';

export default (async function ejectConf(id: string, { ejectPath }: { ejectPath: string }): Promise<EjectConfResult> {
  if (!id) {
    throw new GeneralError('please specify component id');
  }
  const consumer: Consumer = await loadConsumer();
  const attachResults = ejectConfForComponents(consumer, id, { ejectPath });
  await consumer.onDestroy();
  return attachResults;
});
