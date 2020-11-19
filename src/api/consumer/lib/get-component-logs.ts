import { BitId } from '../../../bit-id';
import { loadConsumer, loadConsumerIfExist } from '../../../consumer';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import { ComponentLog } from '../../../scope/models/model-component';

export default async function getComponentLogs(id: string, isRemote: boolean): Promise<ComponentLog[]> {
  if (isRemote) {
    const consumer = await loadConsumerIfExist();
    const bitId: BitId = BitId.parse(id, true);
    const remote = await getRemoteByName(bitId.scope as string, consumer);
    return remote.log(bitId);
  }
  const consumer = await loadConsumer();
  const bitId: BitId = consumer.getParsedId(id);
  return consumer.scope.loadComponentLogs(bitId);
}
