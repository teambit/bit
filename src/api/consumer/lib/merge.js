// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import type { MergeStrategy, ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { BitId } from '../../../bit-id';
import { mergeVersion } from '../../../consumer/versions-ops/merge-version';

export default (async function merge(
  version: string,
  bitIds: BitId[],
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  const mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
  await consumer.onDestroy();
  return mergeResults;
});
