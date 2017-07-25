/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import ComponentsList from '../../../consumer/component/components-list';

export default function status(): Promise<{ inline: Component[], sources: Component[]}> {
  return loadConsumer()
  .then((consumer) => {
    const componentsList = new ComponentsList(consumer);
    const untrackedComponents = componentsList.listUntrackedComponents();
    const newComponents = componentsList.listNewComponents();
    const modifiedComponent = componentsList.listModifiedComponents();
    const stagedComponents = componentsList.listExportPendingComponents();

    return Promise.all([untrackedComponents, newComponents, modifiedComponent, stagedComponents]);
  })
  .then(([untrackedComponents, newComponents, modifiedComponent, stagedComponents]) => {
    return { untrackedComponents, newComponents, modifiedComponent, stagedComponents };
  });
}
