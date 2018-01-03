/** @flow */
import R from 'ramda';
import { BitId } from '../bit-id';
import Component from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import BitMap from '../consumer/bit-map/bit-map';
import logger from '../logger/logger';
import { pathNormalizeToLinux } from '../utils';
import * as linkGenerator from '../links/link-generator';
import linkComponentsToNodeModules from './node-modules-linker';
import Consumer from '../consumer/consumer';
import ComponentWithDependencies from '../scope/component-dependencies';

export async function linkAllToNodeModules(consumer: Consumer) {
  const bitMap = await consumer.getBitMap();
  const componentsMaps = bitMap.getAllComponents();
  if (R.isEmpty(componentsMaps)) throw new Error('nothing to link');
  const componentsIds = Object.keys(componentsMaps).map(componentId => BitId.parse(componentId));
  const { components } = await consumer.loadComponents(componentsIds);
  return linkComponentsToNodeModules(components, bitMap, consumer);
}

export async function writeLinksInDist(component: Component, componentMap, bitMap: BitMap, consumer: Consumer) {
  const componentWithDeps = await component.toComponentWithDependencies(bitMap, consumer);
  await linkGenerator.writeDependencyLinks([componentWithDeps], bitMap, consumer, false);
  const newMainFile = pathNormalizeToLinux(component.calculateMainDistFile());
  await component.updatePackageJsonAttribute(consumer, componentMap.rootDir, 'main', newMainFile);
  linkComponentsToNodeModules([component], bitMap, consumer);
  return linkGenerator.writeEntryPointsForComponent(component, bitMap, consumer);
}

/**
 * an IMPORTED component might be NESTED before.
 * find those components and re-link all their dependents
 */
async function reLinkDirectlyImportedDependencies(
  potentialDependencies: Component[],
  bitMap: BitMap,
  consumer: Consumer
): void {
  const fsComponents = bitMap.getAllComponents([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
  const fsComponentsIds = Object.keys(fsComponents).map(component => BitId.parse(component));
  const potentialDependenciesIds = potentialDependencies.map(c => c.id);
  const components = await consumer.scope.findDirectDependentComponents(fsComponentsIds, potentialDependenciesIds);
  if (!components.length) return;
  logger.debug('reLinkDirectlyImportedDependencies: found components to re-link');
  const componentsWithDependencies = await Promise.all(
    components.map(component => component.toComponentWithDependencies(bitMap, consumer))
  );
  await linkGenerator.writeDependencyLinks(componentsWithDependencies, bitMap, consumer, false);
  linkComponentsToNodeModules(components, bitMap, consumer);
}

/**
 * link the components after import.
 * this process contains the following steps:
 * 1) writing link files to connect imported components to their dependencies
 * 2) writing index.js files (entry-point files) in the root directories of each one of the imported and dependencies components.
 * 3) creating symlinks from components directories to node_modules
 * 4) in case a component was nested and now imported directly, re-link its dependents
 */
export async function linkComponents(
  componentsWithDependencies: ComponentWithDependencies[],
  writtenComponents: Component[],
  writtenDependencies: ?(Component[]),
  bitMap: BitMap,
  consumer: Consumer,
  createNpmLinkFiles: boolean
) {
  const allComponents = writtenDependencies
    ? [...writtenComponents, ...R.flatten(writtenDependencies)]
    : writtenComponents;
  await linkGenerator.writeDependencyLinks(componentsWithDependencies, bitMap, consumer, createNpmLinkFiles);
  if (writtenDependencies) {
    await Promise.all(
      R.flatten(writtenDependencies).map(component =>
        linkGenerator.writeEntryPointsForComponent(component, bitMap, consumer)
      )
    );
  }
  await Promise.all(
    writtenComponents.map(component => linkGenerator.writeEntryPointsForComponent(component, bitMap, consumer))
  );
  linkComponentsToNodeModules(allComponents, bitMap, consumer);
  await reLinkDirectlyImportedDependencies(writtenComponents, bitMap, consumer);
  return allComponents;
}
