/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { COMPONENT_ORIGINS } from '../../../constants';
import loader from '../../../cli/loader';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';

export async function build(id: string, noCache: boolean, verbose: boolean): Promise<?Array<string>> {
  const consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  const component: Component = await consumer.loadComponent(bitId);
  const result = await component.build({ scope: consumer.scope, noCache, consumer, verbose });
  if (result === null) return null;
  const distFilePaths = await component.dists.writeDists(component, consumer);
  await consumer.onDestroy();
  return distFilePaths;
}

export async function buildAll(noCache: boolean, verbose: boolean): Promise<Object> {
  const consumer: Consumer = await loadConsumer();
  const authoredAndImportedIds = consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
  if (R.isEmpty(authoredAndImportedIds)) {
    return {};
  }

  loader.start(BEFORE_LOADING_COMPONENTS);
  const { components } = await consumer.loadComponents(authoredAndImportedIds);
  loader.stop();
  const allComponents = await consumer.scope.buildMultiple(components, consumer, noCache, verbose);
  const componentsObj = {};
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await consumer.onDestroy();
  return componentsObj;
}
