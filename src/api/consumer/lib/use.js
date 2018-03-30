// @flow
import type { UseProps } from '../../../consumer/versions-ops/checkout-version';
import type { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { loadConsumer, Consumer } from '../../../consumer';
import checkoutVersion from '../../../consumer/versions-ops/checkout-version';

export default (async function use(useProps: UseProps): Promise<ApplyVersionResults> {
  const consumer: Consumer = await loadConsumer();
  return checkoutVersion(consumer, useProps);
});
