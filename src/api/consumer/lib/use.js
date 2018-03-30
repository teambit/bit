// @flow
import { switchVersion } from '../../../consumer/component/switch-version';
import type { UseProps, SwitchVersionResults } from '../../../consumer/component/switch-version';
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function use(useProps: UseProps): Promise<SwitchVersionResults> {
  const consumer: Consumer = await loadConsumer();
  return switchVersion(consumer, useProps);
});
