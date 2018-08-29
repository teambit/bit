/** @flow */
import fs from 'fs-extra';
import util from 'util';
import AddComponents from '../../../consumer/component-ops/add-components';
import type { AddProps, AddActionResults } from '../../../consumer/component-ops/add-components/add-components';
import { loadConsumer, Consumer } from '../../../consumer';

const readJsonSync = util.promisify(fs.readJson);

export async function addAction(addProps: AddProps): Promise<AddActionResults> {
  const consumer: Consumer = await loadConsumer();
  const addComponents = new AddComponents(consumer, addProps);
  const addResults = await addComponents.add();
  await consumer.onDestroy();
  return addResults;
}

export async function addMany(filePath: string): Promise<AddActionResults[]> {
  const consumer: Consumer = await loadConsumer();
  const componentsDefinitionObj = readJsonSync(filePath);

  console.log(`my file content is ${JSON.stringify(componentsDefinitionObj)}`);

  const componentsDefinitions = componentsDefinitionObj.components;
  const addComponentsArr = [];
  componentsDefinitions.forEach((componentDefinition) => {
    const addProps = {
      id: componentDefinition.id,
      main: componentDefinition.main,
      tests: componentDefinition.tests,
      namespace: componentDefinition.namespae,
      exclude: componentDefinition.exclude,
      override: componentDefinition.override
    };
    const addComponents = new AddComponents(consumer, addProps);
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
  return addResults;
}
