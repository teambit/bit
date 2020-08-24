import * as path from 'path';

import { BIT_MAP, POST_ADD_HOOK } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import AddComponents from '../../../consumer/component-ops/add-components';
import {
  AddActionResults,
  AddContext,
  AddProps,
  PathOrDSL,
} from '../../../consumer/component-ops/add-components/add-components';
import HooksManager from '../../../hooks';
import { PathOsBased } from '../../../utils/path';

const HooksManagerInstance = HooksManager.getInstance();

export async function addOne(addProps: AddProps): Promise<AddActionResults> {
  const consumer: Consumer = await loadConsumer();
  const addContext: AddContext = { consumer };
  const addComponents = new AddComponents(addContext, addProps);
  const addResults = await addComponents.add();
  await consumer.onDestroy();
  const hookContext = {
    workspacePath: consumer.getPath(),
    bitmapFileName: BIT_MAP,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(POST_ADD_HOOK, addResults, null, hookContext);
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
      ? component.tests.map((testFile) => path.normalize(testFile.trim()))
      : [];
    component.tests = normalizedTests;
    component.exclude = component.exclude
      ? component.exclude.map((excludeFile) => path.normalize(excludeFile.trim()))
      : [];
    const addComponents = new AddComponents(addContext, component);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    addComponentsArr.push(addComponents);
  });
  const addResults = [];
  await Promise.all(
    addComponentsArr.map(async function (addComponents) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const addResultsSingle = await addComponents.add();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      addResults.push(addResultsSingle);
    })
  );
  await consumer.onDestroy();
  const hookContext = {
    workspacePath: consumer.getPath(),
    bitmapFileName: BIT_MAP,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(POST_ADD_HOOK, addResults, null, hookContext);
  return addResults;
}
