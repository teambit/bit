/** @flow */
import {loadConsumer} from "../../../consumer";
import ComponentsList from '../../../consumer/component/components-list';

export default async function remove(id: string): Promise<boolean> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const components = await consumer.loadComponents(componentsIds);
  consumer.scope.put
  const x = await componentsList.getFromObjects();

  console.log(x)
  /* return loadConsumer().then(consumer =>
    consumer.removeFromInline(id)
  );*/
}
