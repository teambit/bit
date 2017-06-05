// @flow
import R from 'ramda';
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import { InlineComponentsMap, ComponentsMap } from '../maps';
import LocalScope from '../scope/local-scope';
import { BitModuleDirectory, InlineComponentsDirectory, ComponentsDirectory } from '../directories';
import MultiLink from '../directories/multi-link';

const stripNonRelevantDataFromLinks = (allLinks, projectRoot) => {
  const links = {};
  const stripProjectRoot = str => str.replace(`${projectRoot}${path.sep}`, '');
  Object.keys(allLinks).forEach((link) => {
    if (allLinks[link] instanceof MultiLink) return;
    links[stripProjectRoot(link)] = stripProjectRoot(allLinks[link].to);
  });
  return links;
};

export default async function bindAction({ projectRoot = process.cwd() }: { projectRoot?: string}):
Promise<any> {
  const bitModuleDirectory = new BitModuleDirectory(projectRoot);
  const inlineComponentsDirectory = new InlineComponentsDirectory(projectRoot);
  const componentsDirectory = new ComponentsDirectory(projectRoot);

  const projectBitJson = BitJson.load(projectRoot);
  const localScope = await LocalScope.load(projectRoot);
  const localScopeName = localScope ? localScope.getScopeName() : null;

  const inlineComponentMap = await InlineComponentsMap.create(projectRoot, projectBitJson);
  const componentsMap = await ComponentsMap.create(projectRoot, projectBitJson, localScopeName);
  const projectDependenciesArray = projectBitJson.getDependenciesArray();

  await bitModuleDirectory.erase();

  bitModuleDirectory.addLinksFromInlineComponents(inlineComponentMap);
  bitModuleDirectory.addLinksFromProjectDependencies(componentsMap, projectDependenciesArray);
  bitModuleDirectory.addLinksFromStageComponents(componentsMap);
  bitModuleDirectory.addLinksForNamespacesAndRoot(componentsMap);

  inlineComponentsDirectory.addLinksToDependencies(inlineComponentMap, componentsMap);
  componentsDirectory.addLinksToDependencies(componentsMap);

  await bitModuleDirectory.persist();
  await inlineComponentsDirectory.persist();
  await componentsDirectory.persist();

  const allLinks = R.mergeAll([
    bitModuleDirectory.links,
    inlineComponentsDirectory.links,
    componentsDirectory.links,
  ]);

  return stripNonRelevantDataFromLinks(allLinks, projectRoot);
}
