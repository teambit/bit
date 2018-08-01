// @flow
import type { PathOsBased } from '../../../../utils/path';
import { Consumer } from '../../..';
import { Driver } from '../../../../driver';

export default (async function dependenciesEnvsResolver(
  consumer: Consumer,
  files: PathOsBased[],
  bindingPrefix: string
) {
  // @todo: get the relative paths from the File object
  const relativePaths = files.map(file => consumer.getPathRelativeToConsumer(file));
  const driver: Driver = consumer.driver;
  const consumerPath = consumer.getPath();
  const bitDir = consumerPath; // @todo: implement

  const getDependenciesTree = async () => {
    return driver.getDependencyTree(
      bitDir,
      consumerPath,
      relativePaths,
      bindingPrefix,
      consumer.bitJson.resolveModules
    );
  };
  const dependenciesTree = await getDependenciesTree();
  return dependenciesTree;
});
