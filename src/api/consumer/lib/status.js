/** @flow */
import { loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component';
import { Component as ModelComponent } from '../../../scope/models';
import { Analytics } from '../../../analytics/analytics';
import loader from '../../../cli/loader';
import { BEFORE_STATUS } from '../../../cli/loader/loader-messages';

export type StatusResult = {
  newComponents: Component[],
  modifiedComponent: Component[],
  stagedComponents: ModelComponent[],
  componentsWithMissingDeps: Component[],
  importPendingComponents: Component[],
  autoTagPendingComponents: string[],
  deletedComponents: string[],
  outdatedComponents: Component[]
};

export default (async function status(): Promise<StatusResult> {
  loader.start(BEFORE_STATUS);
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newAndImportPendingComponents = await componentsList.listNewComponentsAndImportPending();
  const { newComponents, importPendingComponents } = newAndImportPendingComponents;
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents(true);
  const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
  const autoTagPendingComponentsStr = autoTagPendingComponents.map(component => component.id().toString());
  const deletedComponents = await componentsList.listDeletedComponents();
  const deletedComponentsStr = deletedComponents.map(component => component.toString());
  const outdatedComponents = await componentsList.listOutdatedComponents();

  // Run over the components to check if there is missing dependencies
  // If there is at least one we won't commit anything
  const newAndModified = newComponents.concat(modifiedComponent);
  const componentsWithMissingDeps = newAndModified.filter((component: Component) => {
    return Boolean(component.missingDependencies);
  });
  Analytics.setExtraData('new_components', newComponents.length);
  Analytics.setExtraData('staged_components', stagedComponents.length);
  Analytics.setExtraData('num_components_with_missing_dependencies', componentsWithMissingDeps.length);
  Analytics.setExtraData('autoTagPendingComponents', autoTagPendingComponents.length);
  Analytics.setExtraData('deleted', deletedComponents.length);
  await consumer.onDestroy();
  return {
    newComponents: ComponentsList.sortComponentsByName(newComponents),
    modifiedComponent: ComponentsList.sortComponentsByName(modifiedComponent),
    stagedComponents: ComponentsList.sortComponentsByName(stagedComponents),
    componentsWithMissingDeps, // no need to sort, we don't print it as is
    importPendingComponents, // no need to sort, we use only its length
    autoTagPendingComponents: ComponentsList.sortComponentsByName(autoTagPendingComponentsStr),
    deletedComponents: ComponentsList.sortComponentsByName(deletedComponentsStr),
    outdatedComponents
  };
});
