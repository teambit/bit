import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import { MergeStrategy, ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { mergeVersion } from '../../../consumer/versions-ops/merge-version';
import snapMerge, { mergeLanes } from '../../../consumer/versions-ops/merge-version/snap-merge';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';

export default (async function merge(
  values: string[],
  mergeStrategy: MergeStrategy,
  abort: boolean,
  resolve: boolean,
  lane: boolean
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  let mergeResults;
  const firstValue = R.head(values);
  if (lane) {
    const remote = values.length === 2 ? values[0] : null;
    const laneName = values.length === 2 ? values[1] : values[0];
    mergeResults = await mergeLanes(consumer, remote, laneName, mergeStrategy, abort, resolve);
  } else if (!BitId.isValidVersion(firstValue)) {
    const bitIds = getComponentsToMerge(consumer, values);
    // @todo: version could be the lane only or remote/lane
    mergeResults = await snapMerge(consumer, bitIds, mergeStrategy, consumer.getCurrentLaneId(), abort, resolve);
  } else {
    const version = firstValue;
    const ids = R.tail(values);
    const bitIds = getComponentsToMerge(consumer, ids);
    mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
  }
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
