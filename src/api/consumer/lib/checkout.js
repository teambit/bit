// @flow
import R from 'ramda';
import type { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import type { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { loadConsumer, Consumer } from '../../../consumer';
import checkoutVersion from '../../../consumer/versions-ops/checkout-version';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';
import GeneralError from '../../../error/general-error';
import { LATEST, COMPONENT_ORIGINS } from '../../../constants';

/**
 * when user didn't enter any id and used '--all' flag, populate all ids.
 */
async function populateIds(consumer: Consumer, checkoutProps: CheckoutProps) {
  if (!checkoutProps.all) {
    throw new GeneralError('please specify [ids...] or use --all flag');
  }
  const idsFromBitMap = consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.AUTHORED, COMPONENT_ORIGINS.IMPORTED]);
  checkoutProps.ids = idsFromBitMap.map((bitId) => {
    const version = checkoutProps.latestVersion ? LATEST : bitId.version;
    return bitId.changeVersion(version);
  });
}

async function parseValues(consumer: Consumer, values: string[], checkoutProps: CheckoutProps) {
  const firstValue = R.head(values);
  checkoutProps.version =
    firstValue && (BitId.isValidVersion(firstValue) || firstValue === LATEST) ? firstValue : undefined;
  const ids = checkoutProps.version ? R.tail(values) : values; // if first value is a version, the rest are ids
  checkoutProps.latestVersion = Boolean(checkoutProps.version && checkoutProps.version === LATEST);
  if (!firstValue && !checkoutProps.reset && !checkoutProps.all) {
    throw new GeneralError('please enter [values...] or use --reset --all flags');
  }
  if (checkoutProps.reset && checkoutProps.version) {
    throw new GeneralError(
      `the first argument "${
        checkoutProps.version
      }" seems to be a version. however, --reset flag doesn't support a version`
    );
  }
  if (!checkoutProps.reset && !checkoutProps.version) {
    if (ids.length) throw new GeneralError(`the specified version "${ids[0]}" is not a valid version`);
    else throw new GeneralError('please specify a version');
  }
  if (ids.length && checkoutProps.all) {
    throw new GeneralError('please specify either [ids...] or --all, not both');
  }
  if (!ids.length) await populateIds(consumer, checkoutProps);
  else checkoutProps.ids = ids.map(id => consumer.getParsedId(id));
}

export default (async function checkout(values: string[], checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  await parseValues(consumer, values, checkoutProps);
  const checkoutResults = await checkoutVersion(consumer, checkoutProps);
  await consumer.onDestroy();
  return checkoutResults;
});
