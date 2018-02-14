// @flow
import { linkAllToNodeModules, linkComponentsToNodeModules } from '../../links';
import { COMPONENT_ORIGINS } from '../../constants';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import type { LinksResult } from '../../links/node-modules-linker';

/**
 * does the following (the order is important):
 * 1) install npm packages of the consumer root.
 * 2) install npm packages of all imported and nested components
 * 3) link all components
 */
export async function install(consumer: Consumer, verbose: boolean): Promise<LinksResult[]> {
  const candidateComponents = consumer.bitMap.getAllComponents([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.NESTED]);
  const dirs = Object.keys(candidateComponents)
    .map(id => candidateComponents[id].rootDir || null)
    .filter(dir => dir);
  await consumer.installPackages(dirs, verbose, true);
  return linkAllToNodeModules(consumer);
}

/**
 * does the following (the order is important):
 * 1) install npm packages of the provided ids.
 * 2) link the provided ids.
 */
export async function installIds(consumer: Consumer, ids: BitId[], verbose: boolean): Promise<LinksResult[]> {
  const { components } = await consumer.loadComponents(ids);
  const dirs: string[] = components.map(component => component.componentMap.rootDir).filter(dir => dir);
  if (dirs.length) await consumer.installPackages(dirs, verbose);
  return linkComponentsToNodeModules(components, consumer);
}
