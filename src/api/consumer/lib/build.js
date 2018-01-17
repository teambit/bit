/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import ComponentsList from '../../../consumer/component/components-list';

export async function build(id: string, verbose: boolean): Promise<?Array<string>> {
  const bitId = BitId.parse(id);
  const consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const component: Component = await consumer.loadComponent(bitId);
  const result = await component.build({ scope: consumer.scope, consumer, bitMap, verbose });
  if (result === null) return null;
  const distFilePaths = await component.writeDists(consumer, bitMap);
  bitMap.addMainDistFileToComponent(component.id, distFilePaths);
  await bitMap.write();
  // await consumer.driver.runHook('onBuild', [component]);
  return distFilePaths;
}

async function buildAllResults(components, consumer: Consumer, bitMap: BitMap, verbose: boolean) {
  return components.map(async (component) => {
    const result = await component.build({ scope: consumer.scope, consumer, bitMap, verbose });
    const bitId = new BitId({ box: component.box, name: component.name });
    if (result === null) {
      return { component: bitId.toString(), buildResults: null };
    }
    const buildResults = await component.writeDists(consumer, bitMap);
    return { component: bitId.toString(), buildResults };
  });
}

export async function buildAll(verbose: boolean): Promise<Object> {
  const consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
  if (!newAndModifiedComponents || !newAndModifiedComponents.length) return Promise.reject('nothing to build');
  const buildAllP = await buildAllResults(newAndModifiedComponents, consumer, bitMap, verbose);
  const allComponents = await Promise.all(buildAllP);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await bitMap.write();
  // await consumer.driver.runHook('onBuild', allComponents);
  return componentsObj;
}
