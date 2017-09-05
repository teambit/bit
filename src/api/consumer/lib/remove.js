/** @flow */
import {loadConsumer} from "../../../consumer";
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';

export default async function remove(componentsId: string): Promise<boolean> {
  const consumer = await loadConsumer();

  const y = await consumer.scope.remove({ bitId:BitId.parse(componentsId[0]) , consumer });
  //const ref = component[0].VERSIONS[lastVersion];
  //consumer.scope.objects.remove(ref)
  //const x = await componentsList.getFromObjects();

  console.log(x)
  /* return loadConsumer().then(consumer =>
    consumer.removeFromInline(id)
  );*/
}
