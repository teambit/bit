import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component';
import { InvalidComponent } from '../../../consumer/component/consumer-component';
import { ModelComponent } from '../../../scope/models';
import { Analytics } from '../../../analytics/analytics';
import loader from '../../../cli/loader';
import { BEFORE_STATUS } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';
import ComponentsPendingImport from '../../../consumer/component-ops/exceptions/components-pending-import';

export type StatusResult = {
  newComponents: Component[];
  modifiedComponent: Component[];
  stagedComponents: ModelComponent[];
  componentsWithMissingDeps: Component[];
  importPendingComponents: BitId[];
  autoTagPendingComponents: string[];
  invalidComponents: InvalidComponent[];
  outdatedComponents: Component[];
};

export default (async function status(): Promise<StatusResult> {
  loader.start(BEFORE_STATUS);
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const newComponents: Component[] = await componentsList.listNewComponents(true);
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents: ModelComponent[] = await componentsList.listExportPendingComponents();
  const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
  const autoTagPendingComponentsStr = autoTagPendingComponents.map(component => component.id().toString());
  const allInvalidComponents = await componentsList.listInvalidComponents();
  const importPendingComponents = allInvalidComponents
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    .filter(c => c.error instanceof ComponentsPendingImport)
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    .map(i => i.id);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const invalidComponents = allInvalidComponents.filter(c => !(c.error instanceof ComponentsPendingImport));
  const outdatedComponents = await componentsList.listOutdatedComponents();

  // Run over the components to check if there is missing dependencies
  // If there is at least one we won't tag anything
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const newAndModified: BitId[] = newComponents.concat(modifiedComponent);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const componentsWithMissingDeps = newAndModified.filter((component: Component) => {
    if (consumer.isLegacy && component.issues) {
      delete component.issues.relativeComponentsAuthored;
    }
    return Boolean(component.issues) && !R.isEmpty(component.issues);
  });
  Analytics.setExtraData('new_components', newComponents.length);
  Analytics.setExtraData('staged_components', stagedComponents.length);
  Analytics.setExtraData('num_components_with_missing_dependencies', componentsWithMissingDeps.length);
  Analytics.setExtraData('autoTagPendingComponents', autoTagPendingComponents.length);
  Analytics.setExtraData('deleted', invalidComponents.length);
  await consumer.onDestroy();
  return {
    newComponents: ComponentsList.sortComponentsByName(newComponents),
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    modifiedComponent: ComponentsList.sortComponentsByName(modifiedComponent),
    stagedComponents: ComponentsList.sortComponentsByName(stagedComponents),
    componentsWithMissingDeps, // no need to sort, we don't print it as is
    importPendingComponents, // no need to sort, we use only its length
    autoTagPendingComponents: ComponentsList.sortComponentsByName(autoTagPendingComponentsStr),
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    invalidComponents,
    outdatedComponents
  };
});
