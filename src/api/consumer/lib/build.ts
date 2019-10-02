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
  const results = await consumer.scope.buildMultiple([component], consumer, noCache, verbose);
  await consumer.onDestroy();
  return results[0].buildResults;
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
