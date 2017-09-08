/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import { COMPONENT_ORIGINS } from '../../../constants';

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
  const bitPath = consumer.composeRelativeBitPath(id);
  const defaultImpl = consumer.bitJson.getImplBasename();
  const files = { [defaultImpl]: defaultImpl };
  const component = Component.create(
    {
      name: id.name,
      box: id.box,
      withSpecs,
      files,
      consumerBitJson: consumer.bitJson,
      bitPath,
      consumerPath: consumer.getPath()
    },
    consumer.scope
  );
  const bitMap = await BitMap.load(consumer.getPath());
  await component.write({ withBitJson, force, bitMap, origin: COMPONENT_ORIGINS.AUTHORED });
  await bitMap.write();
  // await consumer.driver.runHook('onCreate', component);
  return component;
}
