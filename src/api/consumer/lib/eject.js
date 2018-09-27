/** @flow */

import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import ejectComponents from '../../../consumer/component-ops/eject-components';

export default (async function eject(ids: string[], force: boolean): Promise<*> {
  if (!ids || !ids.length) {
    throw new GeneralError('please specify component ids to eject');
  }
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => consumer.bitMap.getExistingBitId(id)); // this also assure that the ID is in .bitmap
  const results = await ejectComponents(consumer, bitIds, force);
  await consumer.onDestroy();
  return results;
});
