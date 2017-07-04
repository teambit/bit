// @flow
import madge from 'madge';
import Toposort from 'toposort-class';
import findPackage from 'find-package';

const resloveNodePackages = (dependenciesObject: Object, cwd: String) => {
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

const sortDependency = (tree, cwd) => {
  const t:Toposort = new Toposort();
  const sortedDependencieArr:Array<*> = [];
  Object.keys(tree).forEach(key => t.add(key, tree[key].filter(item => !item.includes('node_modules'))));
  const sortedTree:Array<String> = t.sort().reverse();
  const treeWithResolvedDependencies = resloveNodePackages(tree, cwd);
  sortedTree.forEach(key => sortedDependencieArr.push({ component: key,internDependencies: treeWithResolvedDependencies[key].internDependencies, packages: treeWithResolvedDependencies[key].packages }));
  return sortedDependencieArr;
};

export default function getDependecyTree(cwd: String, filePath: String): promise<*> {
  return madge(filePath, { baseDir: cwd, includeNpm: true })
   .then(res => ({ missing: res.skipped, tree: sortDependency(res.tree, cwd) }));
}
