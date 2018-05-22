/** @flow */
import R from 'ramda';
import { BitId } from '../bit-id';
import Component from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import logger from '../logger/logger';
import { pathNormalizeToLinux } from '../utils';
import * as linkGenerator from '../links/link-generator';
import linkComponentsToNodeModules from './node-modules-linker';
import Consumer from '../consumer/consumer';
import ComponentWithDependencies from '../scope/component-dependencies';
import * as packageJson from '../consumer/component/package-json';
import type { LinksResult } from './node-modules-linker';
import GeneralError from '../error/general-error';
import ComponentMap from '../consumer/bit-map/component-map';

export async function linkAllToNodeModules(consumer: Consumer): Promise<LinksResult[]> {
  const componentsMaps = consumer.bitMap.getAllComponents();
  if (R.isEmpty(componentsMaps)) throw new GeneralError('nothing to link');
  const componentsIds = Object.keys(componentsMaps).map(componentId => BitId.parse(componentId));
  const { components } = await consumer.loadComponents(componentsIds);
  return linkComponentsToNodeModules(components, consumer);
}

export async function writeLinksInDist(component: Component, componentMap: ComponentMap, consumer: Consumer) {
  const componentWithDeps = await component.toComponentWithDependencies(consumer);
  await linkGenerator.writeDependencyLinks([componentWithDeps], consumer, false);
  const newMainFile = pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile));
  if (!componentMap.rootDir) throw new GeneralError('writeLinksInDist should get called on imported components only');
  await packageJson.updateAttribute(consumer, componentMap.rootDir, 'main', newMainFile);
  await linkComponentsToNodeModules([component], consumer);
  return linkGenerator.writeEntryPointsForComponent(component, consumer);
}

function findDirectDependentComponents(potentialDependencies: Component[], consumer: Consumer): Promise<Component[]> {
  const fsComponents = consumer.bitMap.getAllComponents([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
  const fsComponentsIds = Object.keys(fsComponents).map(component => BitId.parse(component));
  const potentialDependenciesIds = potentialDependencies.map(c => c.id);
  return consumer.scope.findDirectDependentComponents(fsComponentsIds, potentialDependenciesIds);
}

async function reLinkDirectlyImportedDependencies(components: Component[], consumer: Consumer): Promise<void> {
  logger.debug(`reLinkDirectlyImportedDependencies: found ${components.length} components to re-link`);
  const componentsWithDependencies = await Promise.all(
    components.map(component => component.toComponentWithDependencies(consumer))
  );
  await linkGenerator.writeDependencyLinks(componentsWithDependencies, consumer, false);
  await linkComponentsToNodeModules(components, consumer);
}

/**
 * needed for the following cases:
 * 1) user is importing a component directly which was a dependency before. (before: IMPORTED, now: NESTED).
 * 2) user used bit-move to move a dependency to another directory.
 * as a result of the cases above, the link from the dependent to the dependency is broken.
 * find the dependents components and re-link them
 */
export async function reLinkDependents(consumer: Consumer, components: Component[]): Promise<void> {
  logger.debug('linker: check whether there are direct dependents for re-linking');
  const directDependentComponents = await findDirectDependentComponents(components, consumer);
  if (directDependentComponents.length) {
    await reLinkDirectlyImportedDependencies(directDependentComponents, consumer);
    await packageJson.changeDependenciesToRelativeSyntax(consumer, directDependentComponents, components);
  }
}

/**
 * link the components after import.
 * this process contains the following steps:
 * 1) writing link files to connect imported components to their dependencies
 * 2) writing index.js files (entry-point files) in the root directories of each one of the imported and dependencies components.
 * unless writePackageJson is true, because if package.json is written, its "main" attribute points to the entry-point.
 * 3) creating symlinks from components directories to node_modules
 * 4) in case a component was nested and now imported directly, re-link its dependents
 */
export async function linkComponents(
  componentsWithDependencies: ComponentWithDependencies[],
  writtenComponents: Component[],
  writtenDependencies: ?(Component[]),
  consumer: Consumer,
  createNpmLinkFiles: boolean,
  writePackageJson: boolean
) {
  const allComponents = writtenDependencies
    ? [...writtenComponents, ...R.flatten(writtenDependencies)]
    : writtenComponents;
  await linkGenerator.writeDependencyLinks(componentsWithDependencies, consumer, createNpmLinkFiles);

  // no need for entry-point file if package.json is written.
  if (writtenDependencies) {
    await Promise.all(
      R.flatten(writtenDependencies).map(component => linkGenerator.writeEntryPointsForComponent(component, consumer))
    );
  }
  if (!writePackageJson) {
    await Promise.all(
      writtenComponents.map(component => linkGenerator.writeEntryPointsForComponent(component, consumer))
    );
  }
  await linkComponentsToNodeModules(allComponents, consumer);
  await reLinkDependents(consumer, writtenComponents);
  return allComponents;
}
