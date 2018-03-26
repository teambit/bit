// @flow
import switchVersion from '../../../consumer/component/switch-version';
import type { MergeStrategy, SwitchVersionResults } from '../../../consumer/component/switch-version';
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default (async function use(
  version: string,
  ids: string[],
  promptMergeOptions?: boolean,
  mergeStrategy?: MergeStrategy
): Promise<SwitchVersionResults> {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => BitId.parse(id));
  return switchVersion(consumer, version, bitIds, promptMergeOptions, mergeStrategy);
});
