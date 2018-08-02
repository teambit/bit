// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import type { MergeStrategy, ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { mergeVersion } from '../../../consumer/versions-ops/merge-version';

export default (async function merge(
  version: string,
  ids: string[],
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => consumer.getParsedId(id));
  const mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
  await consumer.onDestroy();
  return mergeResults;
});
