// @flow
import switchVersion from '../../../consumer/component/switch-version';
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default (async function use(version: string, ids: string[]) {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => BitId.parse(id));
  return switchVersion(consumer, version, bitIds);
});
