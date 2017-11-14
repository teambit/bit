/** @flow */
import { loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component';

export type StatusResult = {
  newComponents: Component[],
  modifiedComponent: Component[],
  stagedComponents: string[],
  componentsWithMissingDeps: Component[],
  importPendingComponents: Component[],
  autoTagPendingComponents: string[],
  deletedComponents: string[]
};

export default (async function status(): Promise<StatusResult> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newAndImportPendingComponents = await componentsList.listNewComponentsAndImportPending();
  const { newComponents, importPendingComponents } = newAndImportPendingComponents;
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents();
  const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
  const autoTagPendingComponentsStr = autoTagPendingComponents.map(component => component.id().toString());
  const deletedComponents = await componentsList.listDeletedComponents();
  const deletedComponentsStr = deletedComponents.map(component => component.toString());

  // Run over the components to check if there is missing dependencies
  // If there is at least one we won't commit anything
  const newAndModified = newComponents.concat(modifiedComponent);
  const componentsWithMissingDeps = newAndModified.filter((component: Component) => {
    return Boolean(component.missingDependencies);
  });

  return {
    newComponents: ComponentsList.sortComponentsByName(newComponents),
    modifiedComponent: ComponentsList.sortComponentsByName(modifiedComponent),
    stagedComponents: ComponentsList.sortComponentsByName(stagedComponents),
    componentsWithMissingDeps, // no need to sort, we don't print it as is
    importPendingComponents, // no need to sort, we use only its length
    autoTagPendingComponents: ComponentsList.sortComponentsByName(autoTagPendingComponentsStr),
    deletedComponents: ComponentsList.sortComponentsByName(deletedComponentsStr)
  };
});
