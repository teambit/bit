// @flow
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function bindAction() {
  const consumer: Consumer = await loadConsumer();
  return consumer.bindAll();
});
