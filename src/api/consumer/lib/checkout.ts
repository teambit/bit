import { BitError } from '@teambit/bit-error';
import R from 'ramda';

import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import { HEAD, LATEST } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import checkoutVersion, { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import GeneralError from '../../../error/general-error';
import logger from '../../../logger/logger';
import hasWildcard from '../../../utils/string/has-wildcard';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';

export default async function checkout(values: string[], checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  await parseValues(consumer, values, checkoutProps);
  const checkoutResults = await checkoutVersion(consumer, checkoutProps);
  await consumer.onDestroy();
  return checkoutResults;
}

async function parseValues(consumer: Consumer, values: string[], checkoutProps: CheckoutProps) {
  const firstValue = R.head(values);
  checkoutProps.version =
    firstValue && (BitId.isValidVersion(firstValue) || firstValue === LATEST || firstValue === HEAD)
      ? firstValue
      : undefined;
  const ids = checkoutProps.version ? R.tail(values) : values; // if first value is a version, the rest are ids
  checkoutProps.latestVersion = Boolean(
    checkoutProps.version && (checkoutProps.version === LATEST || checkoutProps.version === HEAD)
  );
  if (checkoutProps.latestVersion && checkoutProps.version === LATEST) {
    throw new BitError(`"latest" is not supported. please use "${HEAD}" instead`);
  }
  if (checkoutProps.latestVersion && !ids.length) {
    if (checkoutProps.all) {
      logger.console(`"--all" is deprecated for "bit checkout ${HEAD}", please omit it.`);
    }
    checkoutProps.all = true;
  }
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
      : ids.map((id) => consumer.getParsedId(id));
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
  const idsFromBitMap = consumer.bitMap.getAllBitIds();
  return idsFromBitMap.map((bitId) => {
    const version = checkoutProps.latestVersion ? LATEST : bitId.version;
    return bitId.changeVersion(version);
  });
}
