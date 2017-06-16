/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';

// todo: improve performance. Components are now fetched multiple times
export default function status(): Promise<{ inline: Component[], sources: Component[]}> {
  return loadConsumer()
  .then(consumer => Promise.all([
    consumer.listFromFileSystem(),
    consumer.listFromBitLock(),
    consumer.scope.listFromObjects(),
    consumer.listNewComponents(),
    consumer.listModifiedComponents(),
    consumer.scope
  ]))
  .then(([listFromFileSystem, listFromBitLock, listFromObjects, newComponents, modifiedComponent, scope]) => {
    const localScopeName = scope.name;
    const objFromFileSystem = listFromFileSystem.reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {});
    const idsFromFileSystem = Object.keys(objFromFileSystem);
    const idsFromBitLock = Object.keys(listFromBitLock);
    const objFromObjects = listFromObjects.reduce((components, component) => {
      const id = component.id.scope === localScopeName ?
        component.id.changeScope(null) : component.id;
      components[id.toString()] = component;
      return components;
    }, {});
    const idsFromObjects = Object.keys(objFromObjects);

    // a component is only on the FS (not the model) and not on bit.lock
    const untrackedComponents = [];
    idsFromFileSystem.forEach((id) => {
      if (!idsFromObjects.includes(id) && !idsFromBitLock.includes(id)) {
        untrackedComponents.push(id);
      }
    });

    // a component is on the model and the scope is local
    const stagedComponents = [];
    idsFromObjects.forEach((id) => {
      if (objFromObjects[id].scope === localScopeName) {
        stagedComponents.push(id);
      }
    });

    return { untrackedComponents, newComponents, modifiedComponent, stagedComponents };
  });
}
