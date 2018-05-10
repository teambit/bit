/** @flow */
import AddComponents from '../../../consumer/component/add-components';
import type { AddProps, AddActionResults } from '../../../consumer/component/add-components/add-components';
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function addAction(addProps: AddProps): Promise<AddActionResults> {
  const consumer: Consumer = await loadConsumer();
  const addComponents = new AddComponents(consumer, addProps);
  const addResults = await addComponents.add();
  await consumer.onDestroy();
  return addResults;
});
