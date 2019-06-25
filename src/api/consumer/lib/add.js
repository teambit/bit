/** @flow */
import path from 'path';
import type { PathOsBased } from '../../../utils/path';
import AddComponents from '../../../consumer/component-ops/add-components';
import type {
  AddProps,
  AddContext,
  AddActionResults,
  PathOrDSL
} from '../../../consumer/component-ops/add-components/add-components';
import { loadConsumer, Consumer } from '../../../consumer';
import { POST_ADD_HOOK } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export async function addOne(addProps: AddProps): Promise<AddActionResults> {
  const consumer: Consumer = await loadConsumer();
  const addContext: AddContext = { consumer };
  const addComponents = new AddComponents(addContext, addProps);
  const addResults = await addComponents.add();
  await consumer.onDestroy();
  HooksManagerInstance.triggerHook(POST_ADD_HOOK, addResults);
  return addResults;
}

export async function addMany(components: AddProps[], alternateCwd?: string): Promise<AddActionResults[]> {
  // we are checking whether the consumer is the default consumer which is process.cwd() or it is overriden , and we are working on another directory which is not the process.cwd()
  const consumerPath = alternateCwd || process.cwd();
  const consumer: Consumer = await loadConsumer(consumerPath);
  const addContext: AddContext = { consumer, alternateCwd: consumerPath };
  const addComponentsArr = [];
  components.forEach((component) => {
    const normalizedPaths: PathOsBased[] = component.componentPaths.map((p) => {
      return path.normalize(p);
    });
    component.componentPaths = normalizedPaths;
    const normalizedTests: PathOrDSL[] = component.tests
      ? component.tests.map(testFile => path.normalize(testFile.trim()))
      : [];
    component.tests = normalizedTests;
    component.exclude = component.exclude
      ? component.exclude.map(excludeFile => path.normalize(excludeFile.trim()))
      : [];
    const addComponents = new AddComponents(addContext, component);
    addComponentsArr.push(addComponents);
  });
  const addResults = [];
  await Promise.all(
    addComponentsArr.map(async function (addComponents) {
      const addResultsSingle = await addComponents.add();
      addResults.push(addResultsSingle);
    })
  );
  await consumer.onDestroy();
  HooksManagerInstance.triggerHook(POST_ADD_HOOK, addResults);
  return addResults;
}
