import R from 'ramda';

import loader from '../../../cli/loader';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { COMPONENT_ORIGINS } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';

export async function build(
  id: string,
  noCache: boolean,
  verbose: boolean,
  workspaceDir = process.cwd()
): Promise<string[] | null | undefined> {
  const consumer = await loadConsumer(workspaceDir);
  const bitId = consumer.getParsedId(id);
  const component: Component = await consumer.loadComponent(bitId);
  const results = await consumer.scope.buildMultiple([component], consumer, noCache, verbose);
  await consumer.onDestroy();
  return results[0].buildResults;
}

export async function buildAll(noCache: boolean, verbose: boolean): Promise<Record<string, any>> {
  const consumer: Consumer = await loadConsumer();
  const authoredAndImportedIds = consumer.bitMap.getAllIdsAvailableOnLane([
    COMPONENT_ORIGINS.IMPORTED,
    COMPONENT_ORIGINS.AUTHORED,
  ]);
  if (R.isEmpty(authoredAndImportedIds)) {
    return {};
  }

  loader.start(BEFORE_LOADING_COMPONENTS);
  const { components } = await consumer.loadComponents(authoredAndImportedIds);
  loader.stop();
  const allComponents = await consumer.scope.buildMultiple(components, consumer, noCache, verbose);
  const componentsObj = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  allComponents.forEach((component) => {
    componentsObj[component.component] = component.buildResults;
  });
  await consumer.onDestroy();
  return componentsObj;
}
