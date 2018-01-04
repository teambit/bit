// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { linkAllToNodeModules } from '../../../links';

export default (async function linkAction() {
  const consumer: Consumer = await loadConsumer();
  return linkAllToNodeModules(consumer);
});
