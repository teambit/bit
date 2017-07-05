/** @flow */
import path from 'path';
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';

/**
 * Creates a new component, writes it to the file system and adds to bit.map
 */
export default async function create(
  idRaw: string,
  withSpecs: boolean = false,
  withBitJson: boolean = false,
  force: boolean = false
  ): Promise<Component> {
  const consumer = await loadConsumer();
  const id = BitId.parse(idRaw);
  const bitPath = consumer.composeBitPath(id);
  const defaultImpl = consumer.bitJson.getImplBasename();
  const files = { [defaultImpl]: path.join(bitPath, defaultImpl) };
  const component = Component.create({
    name: id.name,
    box: id.box,
    withSpecs,
    files,
    consumerBitJson: consumer.bitJson,
  }, consumer.scope);
  const bitMap = await BitMap.load(consumer.getPath());
  await component.write(bitPath, withBitJson, force, bitMap);
  await consumer.driver.runHook('onCreate', component);
  return component;
}
