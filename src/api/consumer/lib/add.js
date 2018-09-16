/** @flow */
import path from 'path';
import type { PathOsBased } from '../../../utils/path';
import AddComponents from '../../../consumer/component-ops/add-components';
import type {
  AddProps,
  AddActionResults,
  PathOrDSL
} from '../../../consumer/component-ops/add-components/add-components';
import { loadConsumer, Consumer } from '../../../consumer';
import logger from '../../../logger/logger';

export async function addOne(addProps: AddProps): Promise<AddActionResults> {
  addProps.configuredConsumer = false;
  const consumer: Consumer = await loadConsumer();
  const addComponents = new AddComponents(consumer, addProps);
  const addResults = await addComponents.add();
  await consumer.onDestroy();
  return addResults;
}

export async function addMany(
  components: AddProps[],
  consumerPath: string = process.cwd()
): Promise<AddActionResults[]> {
  const configureConsumer = consumerPath !== process.cwd();
  const consumer: Consumer = await loadConsumer(consumerPath);
  const addComponentsArr = [];
  components.forEach((componentDefinition) => {
    const normalizedPaths: PathOsBased[] = componentDefinition.componentPaths.map((p) => {
      return path.normalize(p);
    });
    componentDefinition.componentPaths = normalizedPaths;
    const normalizedTests: PathOrDSL[] = componentDefinition.tests
      ? componentDefinition.tests.map(testFile => path.normalize(testFile.trim()))
      : [];
    componentDefinition.tests = normalizedTests;
    componentDefinition.exclude = componentDefinition.exclude
      ? componentDefinition.exclude.map(excludeFile => path.normalize(excludeFile.trim()))
      : [];
    componentDefinition.configuredConsumer = configureConsumer;
    const addComponents = new AddComponents(consumer, componentDefinition);
    addComponentsArr.push(addComponents);
  });
  const addResults = [];
  await Promise.all(
    addComponentsArr.map(async function (addComponents) {
      let addResultsSingle;
      try {
        addResultsSingle = await addComponents.add();
      } catch (ex) {
        logger.error(`got the following exception while adding componnet ${ex.toString()}`);
      }
      addResults.push(addResultsSingle);
    })
  );
  await consumer.onDestroy();
  return addResults;
}
