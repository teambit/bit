/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import BitLock from '../../../consumer/bit-lock';
import { BitId } from '../../../bit-id';

export default async function addAction(componentPath: string, id: string): Promise<Object> {
  const parsedId = BitId.parse(id);
  const consumer: Consumer = await loadConsumer();
  const bitLock = await BitLock.load(consumer.getPath());
  bitLock.addComponent(parsedId.toString(), componentPath);
  await bitLock.write();
  return { added: parsedId.toString() };
}
