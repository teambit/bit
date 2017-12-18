/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import ComponentsList from '../../../consumer/component/components-list';
import { COMPONENT_ORIGINS } from '../../../constants';

function writeDistFiles(component: Component, consumer: Consumer, bitMap: BitMap): Promise<?Array<?string>> {
  const componentMap = bitMap.getComponent(component.id);
  component.updateDistsPerConsumerBitJson(consumer, componentMap);
  const saveDist = component.dists.map(distFile => distFile.write());
  return Promise.all(saveDist);
}

export async function build(id: string): Promise<?Array<string>> {
  const bitId = BitId.parse(id);
  const consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const component: Component = await consumer.loadComponent(bitId);
  const result = await component.build({ scope: consumer.scope, consumer, bitMap });
  if (result === null) return null;
  const distFilePaths = await writeDistFiles(component, consumer, bitMap);
  bitMap.addMainDistFileToComponent(component.id, distFilePaths);
  await bitMap.write();
  // await consumer.driver.runHook('onBuild', [component]);
  return distFilePaths;
}

async function buildAllResults(components, consumer, bitMap) {
  return components.map(async (component) => {
    const result = await component.build({ scope: consumer.scope, consumer, bitMap });
    const bitId = new BitId({ box: component.box, name: component.name });
    if (result === null) {
      return { component: bitId.toString(), buildResults: null };
    }
    const buildResults = await writeDistFiles(component, consumer, bitMap);
    return { component: bitId.toString(), buildResults };
  });
}

export async function buildAll(): Promise<Object> {
  const consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
  if (!newAndModifiedComponents || !newAndModifiedComponents.length) return Promise.reject('nothing to build');
  const buildAllP = await buildAllResults(newAndModifiedComponents, consumer, bitMap);
  const allComponents = await Promise.all(buildAllP);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await bitMap.write();
  // await consumer.driver.runHook('onBuild', allComponents);
  return componentsObj;
}
