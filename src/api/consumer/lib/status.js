/** @flow */
import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import ComponentsList from '../../../consumer/component/components-list';

export default async function status(): Promise<{ inline: Component[], sources: Component[]}> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(true);
  const modifiedComponent = await componentsList.listModifiedComponents(true);
  const stagedComponents = await componentsList.listExportPendingComponents();

  // Run over the components to check if there is missing depenedencies
  // If there is at least one we won't commit anything
  const newAndModified = newComponents.concat(modifiedComponent);
  const componentsWithMissingDeps = newAndModified.filter((component) => {
    return (component.missingDependencies && !R.isEmpty(component.missingDependencies));
  });

  return { newComponents, modifiedComponent, stagedComponents, componentsWithMissingDeps };
}
