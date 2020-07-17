import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import { MergeStrategy, ApplyVersionResults, mergeVersion } from '../../../consumer/versions-ops/merge-version';
import {
  mergeComponentsFromRemote,
  resolveMerge,
  abortMerge,
} from '../../../consumer/versions-ops/merge-version/merge-snaps';
import { mergeLanes } from '../../../consumer/lanes/merge-lanes';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';
import GeneralError from '../../../error/general-error';

export default async function merge(
  values: string[],
  mergeStrategy: MergeStrategy,
  abort: boolean,
  resolve: boolean,
  idIsLane: boolean,
  noSnap: boolean,
  message: string,
  existingOnWorkspaceOnly: boolean
): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  let mergeResults;
  const firstValue = R.head(values);
  if (resolve) {
    mergeResults = await resolveMerge(consumer, values, message);
  } else if (abort) {
    mergeResults = await abortMerge(consumer, values);
  } else if (idIsLane) {
    if (!firstValue) throw new GeneralError('please specify lane name');
    const remote = values.length === 2 ? firstValue : null;
    const laneName = values.length === 2 ? values[1] : firstValue;
    mergeResults = await mergeLanes({
      consumer,
      remoteName: remote,
      laneName,
      mergeStrategy,
      noSnap,
      snapMessage: message,
      existingOnWorkspaceOnly,
    });
  } else if (!BitId.isValidVersion(firstValue)) {
    const bitIds = getComponentsToMerge(consumer, values);
    // @todo: version could be the lane only or remote/lane
    mergeResults = await mergeComponentsFromRemote(consumer, bitIds, mergeStrategy, noSnap, message);
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
