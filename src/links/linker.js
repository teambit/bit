/** @flow */
import R from 'ramda';
import path from 'path';
import type Component from '../consumer/component/consumer-component';
import logger from '../logger/logger';
import { pathNormalizeToLinux } from '../utils';
import * as linkGenerator from '../links/link-generator';
import NodeModuleLinker from './node-modules-linker';
import type Consumer from '../consumer/consumer';
import ComponentWithDependencies from '../scope/component-dependencies';
import * as packageJson from '../consumer/component/package-json';
import type { LinksResult } from './node-modules-linker';
import GeneralError from '../error/general-error';
import ComponentMap from '../consumer/bit-map/component-map';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import JSONFile from '../consumer/component/sources/json-file';
import { PACKAGE_JSON } from '../constants';
import { BitIds } from '../bit-id';
import ComponentsList from '../consumer/component/components-list';

export async function linkAllToNodeModules(consumer: Consumer): Promise<LinksResult[]> {
  const componentsIds = consumer.bitmapIds;
  if (R.isEmpty(componentsIds)) throw new GeneralError('nothing to link');
  const { components } = await consumer.loadComponents(componentsIds);
  const nodeModuleLinker = new NodeModuleLinker(components, consumer);
  return nodeModuleLinker.link();
}

export async function getLinksInDistToWrite(
  component: Component,
  componentMap: ComponentMap,
  consumer: Consumer
): Promise<DataToPersist> {
  const componentWithDeps: ComponentWithDependencies = await component.toComponentWithDependencies(consumer);
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    [componentWithDeps],
    consumer,
    false
  );
  const newMainFile = pathNormalizeToLinux(component.dists.calculateMainDistFile(component.mainFile));
  const rootDir = componentMap.rootDir;
  if (!rootDir) {
    throw new GeneralError('getLinksInDistToWrite should get called on imported components only');
  }
  const nodeModuleLinker = new NodeModuleLinker([component], consumer);
  const nodeModuleLinks = await nodeModuleLinker.getLinks();
  const entryPoints = linkGenerator.getEntryPointsForComponent(component, consumer);
  const dataToPersist = new DataToPersist();
  dataToPersist.addManyFiles(entryPoints);
  dataToPersist.merge(nodeModuleLinks);
  dataToPersist.merge(componentsDependenciesLinks);
  const packageJsonFile = await packageJson.updateAttribute(consumer, rootDir, 'main', newMainFile, false);
  if (packageJsonFile) {
    dataToPersist.addFile(
      JSONFile.load({
        base: rootDir,
        path: path.join(rootDir, PACKAGE_JSON),
        content: packageJsonFile,
        override: true
      })
    );
  }
  return dataToPersist;
}

async function getReLinkDirectlyImportedDependenciesLinks(
  components: Component[],
  consumer: Consumer
): Promise<DataToPersist> {
  logger.debug(`reLinkDirectlyImportedDependencies: found ${components.length} components to re-link`);
  const componentsWithDependencies = await Promise.all(
    components.map(component => component.toComponentWithDependencies(consumer))
  );
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    componentsWithDependencies,
    consumer,
    false
  );
  const nodeModuleLinker = new NodeModuleLinker(components, consumer);
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
 * 1) user is importing a component directly which was a dependency before. (before: IMPORTED, now: NESTED).
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
  const directDependentComponents = await consumer.getAuthoredAndImportedDependentsOfComponents(components);
  const dataToPersist = new DataToPersist();
  if (directDependentComponents.length) {
    if (directDependentComponents.every(c => linkedComponents.has(c.id))) {
      // all components already linked
      return dataToPersist;
    }
    const data = await getReLinkDirectlyImportedDependenciesLinks(directDependentComponents, consumer);
    const packageJsonFiles = await packageJson.changeDependenciesToRelativeSyntax(
      consumer,
      directDependentComponents,
      components
    );
    dataToPersist.merge(data);
    dataToPersist.addManyFiles(packageJsonFiles);
  }
  return dataToPersist;
}

export async function linkComponents(params: {
  componentsWithDependencies: ComponentWithDependencies[],
  writtenComponents: Component[],
  writtenDependencies: ?(Component[]),
  consumer: Consumer,
  createNpmLinkFiles: boolean,
  writePackageJson: boolean
}) {
  const allLinks = await getAllComponentsLinks(params);
  allLinks.addBasePath(params.consumer.getPath());
  await allLinks.persistAllToFS();
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
  createNpmLinkFiles,
  writePackageJson
}: {
  componentsWithDependencies: ComponentWithDependencies[],
  writtenComponents: Component[],
  writtenDependencies: ?(Component[]),
  consumer: Consumer,
  createNpmLinkFiles: boolean,
  writePackageJson: boolean
}): Promise<DataToPersist> {
  const dataToPersist = new DataToPersist();
  const componentsDependenciesLinks = linkGenerator.getComponentsDependenciesLinks(
    componentsWithDependencies,
    consumer,
    createNpmLinkFiles
  );
  if (writtenDependencies) {
    const uniqDependencies = ComponentsList.getUniqueComponents(R.flatten(writtenDependencies));
    const entryPoints = uniqDependencies.map(component =>
      linkGenerator.getEntryPointsForComponent(component, consumer)
    );
    dataToPersist.addManyFiles(R.flatten(entryPoints));
  }
  if (!writePackageJson) {
    // no need for entry-point file if package.json is written.
    const entryPoints = writtenComponents.map(component =>
      linkGenerator.getEntryPointsForComponent(component, consumer)
    );
    dataToPersist.addManyFiles(R.flatten(entryPoints));
  }
  const allComponents = writtenDependencies
    ? [...writtenComponents, ...R.flatten(writtenDependencies)]
    : writtenComponents;
  const nodeModuleLinker = new NodeModuleLinker(allComponents, consumer);
  const nodeModuleLinks = await nodeModuleLinker.getLinks();
  const allComponentsIds = BitIds.fromArray(allComponents.map(c => c.id));
  const reLinkDependentsData = await getReLinkDependentsData(consumer, writtenComponents, allComponentsIds);
  dataToPersist.merge(nodeModuleLinks);
  dataToPersist.merge(reLinkDependentsData);
  dataToPersist.merge(componentsDependenciesLinks);
  return dataToPersist;
}
