// @flow
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function linkAction() {
  const consumer: Consumer = await loadConsumer();
  return consumer.linkAll();
});
