/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import { COMPONENT_ORIGINS } from '../../../constants';
import loader from '../../../cli/loader';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';

export async function build(id: string, verbose: boolean): Promise<?Array<string>> {
  const bitId = BitId.parse(id);
  const consumer = await loadConsumer();
  const component: Component = await consumer.loadComponent(bitId);
  const result = await component.build({ scope: consumer.scope, consumer, verbose });
  if (result === null) return null;
  const distFilePaths = await component.dists.writeDists(component, consumer);
  consumer.bitMap.addMainDistFileToComponent(component.id, distFilePaths);
  await consumer.bitMap.write();
  // await consumer.driver.runHook('onBuild', [component]);
  return distFilePaths;
}

export async function buildAll(verbose: boolean): Promise<Object> {
  const consumer: Consumer = await loadConsumer();
  const authoredAndImported = consumer.bitMap.getAllComponents([
    COMPONENT_ORIGINS.IMPORTED,
    COMPONENT_ORIGINS.AUTHORED
  ]);
  if (R.isEmpty(authoredAndImported)) return Promise.reject('nothing to build');
  const authoredAndImportedIds = Object.keys(authoredAndImported).map(id => BitId.parse(id));
  loader.start(BEFORE_LOADING_COMPONENTS);
  const { components } = await consumer.loadComponents(authoredAndImportedIds);
  const buildAllP = await consumer.scope.buildMultiple(components, consumer, verbose);
  const allComponents = await Promise.all(buildAllP);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await consumer.bitMap.write();
  // await consumer.driver.runHook('onBuild', allComponents);
  return componentsObj;
}
