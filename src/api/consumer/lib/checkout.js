// @flow
import type { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import type { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { loadConsumer, Consumer } from '../../../consumer';
import checkoutVersion from '../../../consumer/versions-ops/checkout-version';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';

export default (async function checkout(checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  const checkoutResults = await checkoutVersion(consumer, checkoutProps);
  await consumer.onDestroy();
  return checkoutResults;
});
