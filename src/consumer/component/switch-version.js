// @flow
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import Component from './consumer-component';
import mergeVersions from '../merge-versions/merge-versions';
import type { MergeResults } from '../merge-versions/merge-versions';
import { resolveConflictPrompt } from '../../prompts';

type ComponentFromFSAndModel = {
  componentFormFS: Component,
  componentFromModel: Component,
  id: BitId,
  mergeResults: ?MergeResults
};
const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
export type MergeStrategy = $Keys<typeof MergeOptions>;

export default (async function switchVersion(
  consumer: Consumer,
  version: string,
  ids: BitId[],
  promptMergeOptions?: boolean,
  mergeStrategy: MergeStrategy
) {
  const { components } = await consumer.loadComponents(ids);
  const allComponentsP = components.map((component: Component) => {
    return getComponentInstances(consumer, component, version);
  });
  const allComponents = await Promise.all(allComponentsP);
  const componentWithConflict = allComponents.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict) {
    if (!promptMergeOptions && !mergeStrategy) {
      throw new Error(
        `component ${componentWithConflict.id.toStringWithoutVersion()} is modified, merging the changes will result in a conflict state, to merge the component use --merge flag`
      );
    }
    if (!mergeStrategy) mergeStrategy = await getMergeStrategy();
  }
  const componentsIdsP = components.map(async ({ id, mergeResults }) => {
    return applyVersion(consumer, id, mergeResults, mergeStrategy);
  });
  const componentsIds = Promise.all(componentsIdsP);

  return { components: componentsIds, version };
});

async function getComponentInstances(
  consumer: Consumer,
  component: Component,
  version: string
): Promise<ComponentFromFSAndModel> {
  const componentModel = await consumer.scope.sources.get(component.id);
  if (!componentModel) {
    throw new Error(`component ${component.id.toString()} doesn't have any version yet`);
  }
  if (!componentModel.hasVersion(version)) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
  const currentlyUsedVersion = BitId.parse(existingBitMapId).version;
  if (currentlyUsedVersion === version) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} uses ${version} already`);
  }
  const latestVersionFromModel = componentModel.latest();
  const latestVersionRef = componentModel.versions[latestVersionFromModel];
  const latestComponentVersion = await consumer.scope.getObject(latestVersionRef.hash);
  const isModified = await consumer.isComponentModified(latestComponentVersion, component);
  let mergeResults: ?MergeResults;
  if (isModified) {
    mergeResults = await mergeVersions({
      consumer,
      componentFromFS: component,
      modelComponent: componentModel,
      fsVersion: version,
      currentVersion: currentlyUsedVersion
    });
  }
  const versionRef = componentModel.versions[version];
  const componentVersion = await consumer.scope.getObject(versionRef.hash);
  const newId = component.id.clone();
  newId.version = version;
  return { componentFormFS: component, componentFromModel: componentVersion, id: newId, mergeResults };
}

async function getMergeStrategy(): Promise<MergeStrategy> {
  try {
    const result = await resolveConflictPrompt();
    return mergeOptionsCli[result.mergeStrategy];
  } catch (err) {
    // probably user clicked ^C
    throw new Error('the action has been canceled');
  }
}

async function applyVersion(
  consumer: Consumer,
  id: BitId,
  mergeResults: MergeResults,
  mergeStrategy: MergeStrategy
): Promise<BitId[]> {
  const componentsWithDependencies = await consumer.scope.getManyWithAllVersions([id]);
  await consumer.writeToComponentsDir({
    componentsWithDependencies,
    force: true
  });
  if (mergeResults) {
    await applyModifiedVersion(id, mergeResults, mergeStrategy);
  }
  return id;
}

async function applyModifiedVersion(id, mergeResults: MergeResults, mergeStrategy: MergeStrategy): Promise<void> {
  if (mergeResults.hasConflict) {
    if (mergeStrategy.manual) {
    }
  }
}
