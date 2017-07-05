// TODO: This should be exported as a bit component

// @flow
import madge from 'madge';
import findPackage from 'find-package';
import R from 'ramda';

const byType = R.groupBy((dependecy) => {
  return R.startsWith('bit/', dependecy) ? 'bits' :
         R.startsWith('node_modules', dependecy) ? 'packages' :
         'files';
});

function resloveNodePackage(packageFullPath) {
  let result = {};
  const packageInfo = findPackage(packageFullPath);
  result[packageInfo.name] = packageInfo.version;

  return result;
}

function groupDependencyList(list, cwd) {
  let groups = byType(list);
  if (groups.packages) {
    const packages = groups.packages.reduce((res, packagePath) => {
      const packageWithVersion = resloveNodePackage(`${cwd}/${packagePath}`);
      return Object.assign(res, packageWithVersion);
    }, {});
    groups.packages = packages;
  }
  return groups;
}

function groupDependencyTree(tree, cwd) {
  let result = {};
  Object.keys(tree).forEach((key) => {
    result[key] = groupDependencyList(tree[key], cwd);
  });

  return result;
}

/**
 * Function for fetching dependecy tree of file or dir
 * @param cwd
 * @param filePath
 * @return {Promise<{missing, tree}>}
 */
export default function getDependecyTree(cwd: string, filePath: string): Promise<*> {
  return madge(filePath, { baseDir: cwd, includeNpm: true })
   .then((res) => ({ missing: res.skipped, tree: groupDependencyTree(res.tree, cwd) }));
}
