/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS } from '../../../constants';

/**
 * Creates a new component, writes it to the file system and adds to bit.map
 */
export default (async function create(
  idRaw: string,
  withSpecs: boolean = false,
  writeBitJson: boolean = false,
  force: boolean = false
): Promise<Component> {
  const consumer = await loadConsumer();
  const id = BitId.parse(idRaw);
  const bitPath = consumer.composeRelativeBitPath(id);
  const defaultImpl = consumer.bitJson.getImplBasename();
  const files = { [defaultImpl]: defaultImpl };
  const mainFile = defaultImpl;
  const component: Component = Component.create(
    {
      name: id.name,
      box: id.box,
      withSpecs,
      files,
      mainFile,
      consumerBitJson: consumer.bitJson,
      bitPath,
      consumer
    },
    consumer.scope
  );
  await component.write({ writeBitJson, force, driver: consumer.driver, origin: COMPONENT_ORIGINS.AUTHORED });
  await consumer.bitMap.write();
  // await consumer.driver.runHook('onCreate', component);
  return component;
});
