import R from 'ramda';

import { BitId, BitIds } from '../bit-id';
import { COMPONENT_ORIGINS } from '../constants';
import BitMap from '../consumer/bit-map/bit-map';
import ComponentMap from '../consumer/bit-map/component-map';
import { throwForNonLegacy } from '../consumer/component/component-schema';
import ComponentsList from '../consumer/component/components-list';
import Component from '../consumer/component/consumer-component';
import * as packageJsonUtils from '../consumer/component/package-json-utils';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import Consumer from '../consumer/consumer';
import * as linkGenerator from '../links/link-generator';
import logger from '../logger/logger';
import ComponentWithDependencies from '../scope/component-dependencies';
import { pathNormalizeToLinux } from '../utils';
import NodeModuleLinker, { LinksResult } from './node-modules-linker';

export async function linkAllToNodeModules(consumer: Consumer, bitIds: BitId[] = []): Promise<LinksResult[]> {
  const componentsIds = bitIds.length ? BitIds.fromArray(bitIds) : consumer.bitMap.getAllIdsAvailableOnLane();
  if (R.isEmpty(componentsIds)) return [];
  const { components } = await consumer.loadComponents(componentsIds);
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  return nodeModuleLinker.link();
}

/**
 * Relevant for legacy components only (before Harmony).
 */
export async function getLinksInDistToWrite(
  component: Component,
  componentMap: ComponentMap,
  consumer: Consumer | null | undefined,
  bitMap: BitMap,
  componentWithDependencies?: ComponentWithDependencies
): Promise<DataToPersist> {
  if (!componentWithDependencies && !consumer) {
    throw new Error('getLinksInDistToWrite expects either consumer or componentWithDependencies to be defined');
  }
  throwForNonLegacy(component.isLegacy, getLinksInDistToWrite.name);
  const nodeModuleLinker = new NodeModuleLinker([component], consumer, bitMap);
  const nodeModuleLinks = await nodeModuleLinker.getLinks();
  const dataToPersist = new DataToPersist();
  dataToPersist.merge(nodeModuleLinks);
  const isAuthored = componentMap.origin === COMPONENT_ORIGINS.AUTHORED;
  if (isAuthored) {
    // authored only need the node-modules links
    return dataToPersist;
  }
  const componentWithDeps: ComponentWithDependencies = // $FlowFixMe
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    componentWithDependencies || (await component.toComponentWithDependencies(consumer));
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    [componentWithDeps],
    consumer,
    false,
    bitMap
  );
  const newMainFile = pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile));
  dataToPersist.merge(componentsDependenciesLinks);
  const packageJsonFile = component.packageJsonFile;
  if (packageJsonFile) {
    packageJsonFile.addOrUpdateProperty('main', newMainFile);
    dataToPersist.addFile(packageJsonFile.toVinylFile());
  }
  const entryPoints = linkGenerator.getEntryPointsForComponent(component, consumer, bitMap);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist.addManyFiles(entryPoints);
  return dataToPersist;
}

async function getReLinkDirectlyImportedDependenciesLinks(
  components: Component[],
  consumer: Consumer
): Promise<DataToPersist> {
  logger.debug(`reLinkDirectlyImportedDependencies: found ${components.length} components to re-link`);
  const componentsWithDependencies = await Promise.all(
    components.map((component) => component.toComponentWithDependencies(consumer))
  );
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    componentsWithDependencies,
    consumer,
    false,
    consumer.bitMap
  );
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  const nodeModuleLinks = await nodeModuleLinker.getLinks();
  const dataToPersist = new DataToPersist();
  dataToPersist.merge(componentsDependenciesLinks);
  dataToPersist.merge(nodeModuleLinks);
  return dataToPersist;
}

export async function reLinkDependents(consumer: Consumer, components: Component[]): Promise<void> {
  const links = await getReLinkDependentsData(consumer, components, new BitIds());
  links.addBasePath(consumer.getPath());
  await links.persistAllToFS();
}

/**
 * needed for the following cases:
 * 1) user is importing a component directly which was a dependency before. (before: NESTED, now: IMPORTED).
 * 2) user used bit-move to move a dependency to another directory.
 * as a result of the cases above, the link from the dependent to the dependency is broken.
 * find the dependents components and re-link them
 */
export async function getReLinkDependentsData(
  consumer: Consumer,
  components: Component[],
  linkedComponents: BitIds
): Promise<DataToPersist> {
  logger.debug('linker: check whether there are direct dependents for re-linking');
  const directDependentComponents = await consumer.getAuthoredAndImportedDependentsComponentsOf(components);
  const dataToPersist = new DataToPersist();
  if (directDependentComponents.length) {
    if (directDependentComponents.every((c) => linkedComponents.has(c.id))) {
      // all components already linked
      return dataToPersist;
    }
    const data = await getReLinkDirectlyImportedDependenciesLinks(directDependentComponents, consumer);
    const packageJsonFiles = await packageJsonUtils.changeDependenciesToRelativeSyntax(
      consumer,
      directDependentComponents,
      components
    );
    dataToPersist.merge(data);
    dataToPersist.addManyFiles(packageJsonFiles);
  }
  return dataToPersist;
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
export async function getAllComponentsLinks({
  componentsWithDependencies,
  writtenComponents,
  writtenDependencies,
  consumer,
  bitMap,
  createNpmLinkFiles,
}: {
  componentsWithDependencies: ComponentWithDependencies[];
  writtenComponents: Component[];
  writtenDependencies: Component[] | null | undefined;
  consumer: Consumer | null | undefined;
  bitMap: BitMap;
  createNpmLinkFiles: boolean;
}): Promise<DataToPersist> {
  const dataToPersist = new DataToPersist();
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    componentsWithDependencies,
    consumer,
    createNpmLinkFiles,
    bitMap
  );
  if (writtenDependencies) {
    const uniqDependencies = ComponentsList.getUniqueComponents(R.flatten(writtenDependencies));
    const entryPoints = uniqDependencies.map((component) =>
      linkGenerator.getEntryPointsForComponent(component, consumer, bitMap)
    );
    dataToPersist.addManyFiles(R.flatten(entryPoints));
  }
  const entryPoints = writtenComponents.map((component) =>
    linkGenerator.getEntryPointsForComponent(component, consumer, bitMap)
  );
  dataToPersist.addManyFiles(R.flatten(entryPoints));
  const bitAngularEntryPoints = writtenComponents
    .map((component) => linkGenerator.getEntryPointForAngularComponent(component, consumer, bitMap))
    .filter((x) => x); // remove nulls when components are not Angular
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist.addManyFiles(bitAngularEntryPoints);

  const allComponents = writtenDependencies
    ? [...writtenComponents, ...R.flatten(writtenDependencies)]
    : writtenComponents;
  const nodeModuleLinker = new NodeModuleLinker(allComponents, consumer, bitMap);
  const nodeModuleLinks = await nodeModuleLinker.getLinks();
  dataToPersist.merge(nodeModuleLinks);

  if (consumer) {
    const allComponentsIds = BitIds.uniqFromArray(allComponents.map((c) => c.id));
    const reLinkDependentsData = await getReLinkDependentsData(consumer, writtenComponents, allComponentsIds);
    dataToPersist.merge(reLinkDependentsData);
  }

  dataToPersist.merge(componentsDependenciesLinks);
  return dataToPersist;
}
