/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';
import {
  BEFORE_LOADING_COMPONENTS,
  BEFORE_RUNNING_SPECS,
  BEFORE_IMPORT_ENVIRONMENT
} from '../../../cli/loader/loader-messages';

export default (async function test(id?: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  let components;
  if (id) {
    const idParsed = BitId.parse(id);
    const component = await consumer.loadComponent(idParsed);
    components = [component];
  } else {
    const componentsList = new ComponentsList(consumer);
    loader.start(BEFORE_LOADING_COMPONENTS);
    components = await componentsList.newAndModifiedComponents();

    // when testing multiple components, we need to build all of them first.
    // building only the one we test, won't be sufficient because it may depends on another pre-build component
    const testersIds = components.map(c => c.testerId);
    // No need to install compilers since we do it in the buildMultiple function
    // const compilerIds = components.map(c => c.compilerId);
    // const allEnvsIds = testersIds.concat(compilerIds);
    loader.start(BEFORE_IMPORT_ENVIRONMENT);
    await consumer.scope.installEnvironment({ ids: testersIds, verbose });
    await consumer.scope.buildMultiple(components, consumer, true);
  }

  loader.start(BEFORE_RUNNING_SPECS);
  const specsResults = components.map(async (component) => {
    if (!component.testerId) {
      return { component, missingTester: true };
    }
    const result = await component.runSpecs({ scope: consumer.scope, consumer, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
});
