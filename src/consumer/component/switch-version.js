// @flow
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import Component from './consumer-component';

type ComponentFromFSAndModel = { componentFormFS: Component, componentFromModel: Component, id: BitId };

export default (async function switchVersion(consumer: Consumer, version: string, ids: BitId[]) {
  const { components } = await consumer.loadComponents(ids);
  const allComponentsP = components.map(async (component: Component) => {
    const componentModel = await consumer.scope.sources.get(component.id);
    if (!componentModel) {
      throw new Error(`component ${component.id.toString()} doesn't have any version yet`);
    }
    if (!componentModel.hasVersion(version)) {
      throw new Error(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
    }
    const latestVersionFromModel = componentModel.latest();
    const latestVersionRef = componentModel.versions[latestVersionFromModel];
    const latestComponentVersion = await consumer.scope.getObject(latestVersionRef.hash);
    const isModified = await consumer.isComponentModified(latestComponentVersion, component);
    if (isModified) {
      throw new Error(
        `component ${component.id.toStringWithoutVersion()} is modified, merging your changes is not supported just yet, please revert your local changes and try again`
      );
    }
    const versionRef = componentModel.versions[version];
    const componentVersion = await consumer.scope.getObject(versionRef.hash);
    const newId = component.id.clone();
    newId.version = version;
    return { componentFormFS: component, componentFromModel: componentVersion, id: newId };
  });
  const allComponents = await Promise.all(allComponentsP);
  const componentsIds = await applyVersion(consumer, allComponents);
  return { components: componentsIds, version };
});

async function applyVersion(consumer: Consumer, components: ComponentFromFSAndModel[]): Promise<BitId[]> {
  const ids = components.map(async ({ id }) => {
    const componentsWithDependencies = await consumer.scope.getManyWithAllVersions([id]);
    await consumer.writeToComponentsDir({
      componentsWithDependencies,
      force: true
    });
    return id;
  });
  return Promise.all(ids);
}
