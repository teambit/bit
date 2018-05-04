// @flow
import type { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import type { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { loadConsumer, Consumer } from '../../../consumer';
import checkoutVersion from '../../../consumer/versions-ops/checkout-version';

export default (async function checkout(checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  const checkoutResults = await checkoutVersion(consumer, checkoutProps);
  await consumer.onDestroy();
  return checkoutResults;
});
