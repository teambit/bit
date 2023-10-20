import { ComponentID } from '@teambit/component-id';
import { loadConsumer, loadConsumerIfExist } from '../../../consumer';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import { ComponentLog } from '../../../scope/models/model-component';

export default async function getComponentLogs(id: string, isRemote: boolean): Promise<ComponentLog[]> {
  if (isRemote) {
    const consumer = await loadConsumerIfExist();
    const bitId = ComponentID.fromString(id);
    const remote = await getRemoteByName(bitId.scope, consumer);
    return remote.log(bitId);
  }
  const consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  return consumer.scope.loadComponentLogs(bitId);
}
