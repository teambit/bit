import R from 'ramda';
import { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { loadConsumer, Consumer } from '../../../consumer';
import checkoutVersion from '../../../consumer/versions-ops/checkout-version';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';
import GeneralError from '../../../error/general-error';
import { LATEST } from '../../../constants';
import hasWildcard from '../../../utils/string/has-wildcard';
import ComponentsList from '../../../consumer/component/components-list';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';
import LaneId from '../../../lane-id/lane-id';

export default (async function checkout(values: string[], checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  await parseValues(consumer, values, checkoutProps);
  const checkoutResults = await checkoutVersion(consumer, checkoutProps);
  await consumer.onDestroy();
  return checkoutResults;
});

async function parseValues(consumer: Consumer, values: string[], checkoutProps: CheckoutProps) {
  const firstValue = R.head(values);
  checkoutProps.version =
    firstValue && !checkoutProps.isLane && (BitId.isValidVersion(firstValue) || firstValue === LATEST)
      ? firstValue
      : undefined;
  const ids = checkoutProps.version ? R.tail(values) : values; // if first value is a version, the rest are ids
  checkoutProps.latestVersion = Boolean(checkoutProps.version && checkoutProps.version === LATEST);
  if (!firstValue && !checkoutProps.reset && !checkoutProps.all) {
    throw new GeneralError('please enter [values...] or use --reset --all flags');
  }
  if (checkoutProps.reset && checkoutProps.version) {
    throw new GeneralError(
      `the first argument "${checkoutProps.version}" seems to be a version. however, --reset flag doesn't support a version`
    );
  }
  if (ids.length && checkoutProps.all) {
    throw new GeneralError('please specify either [ids...] or --all, not both');
  }
  if (checkoutProps.isLane) {
    if (values.length > 2) throw new GeneralError(`unable to checkout to more than one lane`);
    // we support two syntaxes. `bit checkout <remote> <lane>` and `bit checkout <local-lane>`.
    const laneName = values.length === 1 ? firstValue : values[1];
    const remoteScopeLane = values.length === 2 ? firstValue : undefined;
    const lanes = await consumer.scope.listLanes();
    if (remoteScopeLane) {
      const localTrackedLane = consumer.scope.getLocalTrackedLaneByRemoteName(laneName, remoteScopeLane);
      checkoutProps.localLaneName = localTrackedLane || laneName;
      if (consumer.getCurrentLaneId().name === checkoutProps.localLaneName) {
        throw new GeneralError(`already checked out to "${checkoutProps.localLaneName}"`);
      }
      const remoteLane = await consumer.scope.objects.remoteLanes.getRemoteLane(
        remoteScopeLane,
        new LaneId({ name: laneName })
      );
      if (!remoteLane.length) {
        throw new GeneralError(`remote lane ${remoteScopeLane}/${laneName} does not exist, please import it first`);
      }
      const laneExistsLocally = lanes.find(l => l.name === checkoutProps.localLaneName);
      if (laneExistsLocally) {
        throw new GeneralError(`unable to checkout to a remote lane ${remoteScopeLane}/${laneName}.
the local lane ${checkoutProps.localLaneName} already exists, please checkout to the local lane by omitting the remote-scope name.
then you can run "bit merge" to merge the remote lane into the local lane`);
      }
      checkoutProps.ids = remoteLane.map(
        l => new BitId({ scope: remoteScopeLane, name: l.name, version: l.head.toString() })
      );
      checkoutProps.remoteLaneScope = remoteScopeLane;
      checkoutProps.remoteLaneName = laneName;
      checkoutProps.remoteLane = remoteLane;
      checkoutProps.localTrackedLane = localTrackedLane || undefined;
      return;
    }
    checkoutProps.localLaneName = laneName;
    if (consumer.getCurrentLaneId().name === laneName) {
      throw new GeneralError(`already checked out to "${laneName}"`);
    }
    const localLane = lanes.find(lane => lane.name === laneName);
    if (!localLane) {
      throw new GeneralError(`unable to find a local lane "${laneName}"`);
    }
    checkoutProps.ids = localLane.components.map(c => c.id.changeVersion(c.head.toString()));
    return;
  }
  if (!checkoutProps.reset && !checkoutProps.version) {
    if (ids.length) throw new GeneralError(`the specified version "${ids[0]}" is not a valid version`);
    else throw new GeneralError('please specify a version');
  }
  if (!ids.length) {
    populateAllIds(consumer, checkoutProps);
  } else {
    const idsHasWildcard = hasWildcard(ids);
    checkoutProps.ids = idsHasWildcard
      ? getIdsMatchedByWildcard(consumer, checkoutProps, ids)
      : ids.map(id => consumer.getParsedId(id));
  }
}

/**
 * when user didn't enter any id and used '--all' flag, populate all ids.
 */
function populateAllIds(consumer: Consumer, checkoutProps: CheckoutProps) {
  if (!checkoutProps.all) {
    throw new GeneralError('please specify [ids...] or use --all flag');
  }
  checkoutProps.ids = getCandidateIds(consumer, checkoutProps);
}

function getIdsMatchedByWildcard(consumer: Consumer, checkoutProps: CheckoutProps, ids: string[]): BitId[] {
  const candidateIds = getCandidateIds(consumer, checkoutProps);
  const matchedIds = ComponentsList.filterComponentsByWildcard(candidateIds, ids);
  if (!matchedIds.length) throw new NoIdMatchWildcard(ids);
  return matchedIds;
}

function getCandidateIds(consumer: Consumer, checkoutProps: CheckoutProps): BitId[] {
  const idsFromBitMap = consumer.bitMap.getAuthoredAndImportedBitIds();
  return idsFromBitMap.map(bitId => {
    const version = checkoutProps.latestVersion ? LATEST : bitId.version;
    return bitId.changeVersion(version);
  });
}
