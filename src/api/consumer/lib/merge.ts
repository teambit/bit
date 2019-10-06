import { loadConsumer, Consumer } from '../../../consumer';
import { MergeStrategy, ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { mergeVersion } from '../../../consumer/versions-ops/merge-version';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';

export default (async function merge(
  version: string,
  ids: string[],
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  const bitIds = getComponentsToMerge(consumer, ids);
  const mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
  await consumer.onDestroy();
  return mergeResults;
});

function getComponentsToMerge(consumer: Consumer, ids: string[]): BitId[] {
  if (hasWildcard(ids)) {
    const componentsList = new ComponentsList(consumer);
    return componentsList.listComponentsByIdsWithWildcard(ids);
  }
  return ids.map(id => consumer.getParsedId(id));
}
