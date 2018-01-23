/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS } from '../../../constants';

export async function build(id: string, verbose: boolean): Promise<?Array<string>> {
  const bitId = BitId.parse(id);
  const consumer = await loadConsumer();
  const component: Component = await consumer.loadComponent(bitId);
  const result = await component.build({ scope: consumer.scope, consumer, verbose });
  if (result === null) return null;
  const distFilePaths = await component.writeDists(consumer);
  consumer.bitMap.addMainDistFileToComponent(component.id, distFilePaths);
  await consumer.bitMap.write();
  // await consumer.driver.runHook('onBuild', [component]);
  return distFilePaths;
}

async function buildAllResults(components, consumer: Consumer, verbose: boolean) {
  return components.map(async (component: Component) => {
    const result = await component.build({ scope: consumer.scope, consumer, verbose });
    const bitId = new BitId({ box: component.box, name: component.name });
    if (result === null) {
      return { component: bitId.toString(), buildResults: null };
    }
    const buildResults = await component.writeDists(consumer);
    return { component: bitId.toString(), buildResults };
  });
}

export async function buildAll(verbose: boolean): Promise<Object> {
  const consumer: Consumer = await loadConsumer();
  const authoredAndImported = consumer.bitMap.getAllComponents([
    COMPONENT_ORIGINS.IMPORTED,
    COMPONENT_ORIGINS.AUTHORED
  ]);
  if (R.isEmpty(authoredAndImported)) return Promise.reject('nothing to build');
  const authoredAndImportedIds = Object.keys(authoredAndImported).map(id => BitId.parse(id));
  const { components } = await consumer.loadComponents(authoredAndImportedIds);
  const buildAllP = await buildAllResults(components, consumer, verbose);
  const allComponents = await Promise.all(buildAllP);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await consumer.bitMap.write();
  // await consumer.driver.runHook('onBuild', allComponents);
  return componentsObj;
}
