import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import EjectComponents from '../../../consumer/component-ops/eject-components';
import { EjectResults } from '../../../consumer/component-ops/eject-components';

export default (async function eject(ids: string[], force: boolean): Promise<EjectResults> {
  if (!ids || !ids.length) {
    throw new GeneralError('please specify component ids to eject');
  }
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map((id) => consumer.bitMap.getExistingBitId(id)); // this also assure that the ID is in .bitmap
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const ejectComponents = new EjectComponents(consumer, bitIds, force);
  const ejectResults = await ejectComponents.eject();
  await consumer.onDestroy();
  return ejectResults;
});
