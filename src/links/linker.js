/** @flow */
import R from 'ramda';
import { BitId } from '../bit-id';
import Component from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import BitMap from '../consumer/bit-map/bit-map';
import logger from '../logger/logger';
import { pathNormalizeToLinux } from '../utils';
import * as linkGenerator from '../links/link-generator';
import nodeModulesLinkComponents from './node-modules-linker';
import Consumer from '../consumer/consumer';

export async function linkAllToNodeModules(consumer: Consumer) {
  const bitMap = await consumer.getBitMap();
  const componentsMaps = bitMap.getAllComponents();
  if (R.isEmpty(componentsMaps)) throw new Error('nothing to link');
  const componentsIds = Object.keys(componentsMaps).map(componentId => BitId.parse(componentId));
  const { components } = await consumer.loadComponents(componentsIds);
  return nodeModulesLinkComponents(components, bitMap, consumer);
}

export async function writeLinksInDist(component: Component, componentMap, bitMap: BitMap, consumer: Consumer) {
  const componentWithDeps = await component.toComponentWithDependencies(bitMap, consumer);
  await linkGenerator.writeDependencyLinks([componentWithDeps], bitMap, consumer, false);
  const newMainFile = pathNormalizeToLinux(component.calculateMainDistFile());
  await component.updatePackageJsonAttribute(consumer, componentMap.rootDir, 'main', newMainFile);
  nodeModulesLinkComponents([component], bitMap, consumer);
  return linkGenerator.writeEntryPointsForComponent(component, bitMap, consumer);
}

/**
 * an IMPORTED component might be NESTED before.
 * find those components and re-link all their dependents
 */
export async function reLinkDirectlyImportedDependencies(
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
  nodeModulesLinkComponents(components, bitMap, consumer);
}
