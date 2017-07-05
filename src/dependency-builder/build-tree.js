// TODO: This should be exported as a bit component

// @flow
import madge from 'madge';
import Toposort from 'toposort-class';
import findPackage from 'find-package';

/**
 * Used for resolving npm package dependencies returned by madge
 * @param dependenciesObject
 * @param cwd
 * @return {Object}
 */
const resloveNodePackages = (dependenciesObject: Object, cwd: string) => {
  const newDependencyObject:Object = {};
  Object.keys(dependenciesObject).forEach((key) => {
    const packagesArr = [];
    const componentsArr = [];
    dependenciesObject[key].forEach((item) => {
      if (item.startsWith('node_modules')) {
        const packageInfo = findPackage(`${cwd}/${item}`);
        packagesArr.push({ name: packageInfo.name, version: packageInfo.version });
      } else {
        componentsArr.push(item);
      }
    });
    newDependencyObject[key] = { packages: packagesArr, internalDependencies: componentsArr };
  });
  return newDependencyObject;
};

/**
 * sortDependency- will sort depdency tree according to depndecies
 * @param tree
 * @param cwd
 * @return {Array<*>}
 */
const sortDependency = (tree, cwd) => {
  const t:Toposort = new Toposort();
  const sortedDependencieArr:Array<*> = [];
  Object.keys(tree).forEach(key => t.add(key, tree[key].filter(item => !item.includes('node_modules'))));
  const sortedTree:string[] = t.sort().reverse();
  const treeWithResolvedDependencies = resloveNodePackages(tree, cwd);
  sortedTree.forEach(key => sortedDependencieArr.push({
    component: key,
    internDependencies: treeWithResolvedDependencies[key].internDependencies,
    packages: treeWithResolvedDependencies[key].packages }));
  return sortedDependencieArr;
};


/**
 * Function for fetching dependecy tree of file or dir
 * @param cwd
 * @param filePath
 * @return {Promise<{missing, tree}>}
 */
export default function getDependecyTree(cwd: string, filePath: string): Promise<*> {
  return madge(filePath, { baseDir: cwd, includeNpm: true })
   .then(res => ({ missing: res.skipped, tree: sortDependency(res.tree, cwd) }));
}
