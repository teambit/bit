import * as path from 'path';

import { Consumer } from '..';
import { Analytics } from '../../analytics/analytics';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import { linkAllToNodeModules, NodeModuleLinker } from '../../links';
import { LinksResult } from '../../links/node-modules-linker';
import { installPackages } from '../../npm-client/install-packages';

/**
 * does the following (the order is important):
 * 1) install npm packages of the consumer root.
 * 2) install npm packages of all imported and nested components
 * 3) link all components
 */
export async function install(consumer: Consumer, verbose: boolean): Promise<LinksResult[]> {
  const candidateComponents = consumer.bitMap.getAllComponents([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.NESTED]);
  const dirs = candidateComponents.map((componentMap) => componentMap.rootDir).filter((dir) => dir);
  const consumerPath = consumer.getPath();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const dirsAbsolute = dirs.map((dir) => path.join(consumerPath, dir));
  await installPackages(consumer, dirsAbsolute, verbose, true);
  return linkAllToNodeModules(consumer);
}

/**
 * does the following (the order is important):
 * 1) install npm packages of the provided ids.
 * 2) link the provided ids.
 */
export async function installIds(consumer: Consumer, ids: BitId[], verbose: boolean): Promise<LinksResult[]> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const { components } = await consumer.loadComponents(ids);
  const dirs = components.map((component) => component.componentMap?.rootDir).filter((dir) => dir) as string[];
  if (dirs.length) await installPackages(consumer, dirs, verbose);
  Analytics.setExtraData('num_components', components.length);
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  return nodeModuleLinker.link();
}
