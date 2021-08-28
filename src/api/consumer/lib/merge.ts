import R from 'ramda';
import { BitId } from '../../../bit-id';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import { ApplyVersionResults, MergeStrategy, mergeVersion } from '../../../consumer/versions-ops/merge-version';
import {
  abortMerge,
  mergeComponentsFromRemote,
  resolveMerge,
} from '../../../consumer/versions-ops/merge-version/merge-snaps';
import hasWildcard from '../../../utils/string/has-wildcard';

export default async function merge(
  values: string[],
  mergeStrategy: MergeStrategy,
  abort: boolean,
  resolve: boolean,
  noSnap: boolean,
  message: string,
  build: boolean
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  if (consumer.isLegacy && (noSnap || message || abort || resolve)) {
    throw new LanesIsDisabled();
  }
  let mergeResults;
  const firstValue = R.head(values);
  if (resolve) {
    mergeResults = await resolveMerge(consumer, values, message, build);
  } else if (abort) {
    mergeResults = await abortMerge(consumer, values);
  } else if (!BitId.isValidVersion(firstValue)) {
    const bitIds = getComponentsToMerge(consumer, values);
    // @todo: version could be the lane only or remote/lane
    mergeResults = await mergeComponentsFromRemote(consumer, bitIds, mergeStrategy, noSnap, message, build);
  } else {
    const version = firstValue;
    const ids = R.tail(values);
    const bitIds = getComponentsToMerge(consumer, ids);
    mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
  }
  await consumer.onDestroy();
  return mergeResults;
}

function getComponentsToMerge(consumer: Consumer, ids: string[]): BitId[] {
  if (hasWildcard(ids)) {
    const componentsList = new ComponentsList(consumer);
    return componentsList.listComponentsByIdsWithWildcard(ids);
  }
  return ids.map((id) => consumer.getParsedId(id));
}
