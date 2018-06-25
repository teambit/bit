// @flow
import R from 'ramda';
import path from 'path';
import { BitModuleDirectory, ComponentsDirectory } from '../directories';
import MultiLink from '../directories/multi-link';
import BitMap from '../bit-map';

const stripNonRelevantDataFromLinks = (allLinks, projectRoot) => {
  const links = {};
  const stripProjectRoot = str => str.replace(`${projectRoot}${path.sep}`, '');
  Object.keys(allLinks).forEach((link) => {
    if (allLinks[link] instanceof MultiLink) return;
    links[stripProjectRoot(link)] = stripProjectRoot(allLinks[link].to);
  });
  return links;
};

export default (async function bindAction({ projectRoot = process.cwd() }: { projectRoot?: string }): Promise<any> {
  const bitModuleDirectory = new BitModuleDirectory(projectRoot);
  const componentsDirectory = new ComponentsDirectory(projectRoot);

  const bitMap = await BitMap.load(projectRoot);
  await bitModuleDirectory.erase();
  const componentsMap = bitMap.getAllComponents();

  bitModuleDirectory.addLinksFromBitMap(componentsMap);
  bitModuleDirectory.addLinksForNamespacesAndRoot(componentsMap);
  componentsDirectory.addLinksToDependencies(componentsMap);

  await bitModuleDirectory.persist();
  await componentsDirectory.persist();

  const allLinks = R.mergeAll([bitModuleDirectory.links, componentsDirectory.links]);

  return stripNonRelevantDataFromLinks(allLinks, projectRoot);
});
