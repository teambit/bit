/** @flow */
import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component';

export type StatusResult = {
  newComponents: Component[],
  modifiedComponent: Component[],
  stagedComponents: string[],
  componentsWithMissingDeps: Component[],
  importPendingComponents: Component[]
};

export default (async function status(): Promise<StatusResult> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newAndImportPendingComponents = await componentsList.listNewComponentsAndImportPending();
  const { newComponents, importPendingComponents } = newAndImportPendingComponents;
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents();
  const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
  const deletedComponents = await componentsList.listDeletedComponents();

  // Run over the components to check if there is missing dependencies
  // If there is at least one we won't commit anything
  const newAndModified = newComponents.concat(modifiedComponent);
  const componentsWithMissingDeps = newAndModified.filter((component: Component) => {
    return Boolean(component.missingDependencies);
  });

  return {
    newComponents,
    modifiedComponent,
    stagedComponents,
    componentsWithMissingDeps,
    importPendingComponents,
    autoTagPendingComponents,
    deletedComponents
  };
});
