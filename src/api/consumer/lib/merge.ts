import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import { MergeStrategy, ApplyVersionResults, mergeVersion } from '../../../consumer/versions-ops/merge-version';
import snapMerge from '../../../consumer/versions-ops/merge-version/snap-merge';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';
import mergeLanes from '../../../consumer/versions-ops/merge-version/merge-lanes';
import GeneralError from '../../../error/general-error';

export default (async function merge(
  values: string[],
  mergeStrategy: MergeStrategy,
  abort: boolean,
  resolve: boolean,
  idIsLane: boolean,
  noSnap: boolean,
  message: string
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  let mergeResults;
  const firstValue = R.head(values);
  if (idIsLane) {
    if (!firstValue) throw new GeneralError('please specify lane name');
    const remote = values.length === 2 ? firstValue : null;
    const laneName = values.length === 2 ? values[1] : firstValue;
    mergeResults = await mergeLanes({ consumer, remoteName: remote, laneName, mergeStrategy, abort, resolve });
  } else if (!BitId.isValidVersion(firstValue)) {
    const bitIds = getComponentsToMerge(consumer, values);
    // @todo: version could be the lane only or remote/lane
    mergeResults = await snapMerge(
      consumer,
      bitIds,
      mergeStrategy,
      consumer.getCurrentLaneId(),
      abort,
      resolve,
      noSnap,
      message
    );
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
