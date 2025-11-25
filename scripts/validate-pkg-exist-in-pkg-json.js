/**
 * find all packages used in the code if the package is not mentioned in the package.json throw an error
 */

const fs = require('fs-extra');
const globby = require('globby');
const { uniq } = require('lodash');
const pkgJson = require('../package.json');
const pkgJsonDeps = [...Object.keys(pkgJson.dependencies), ...Object.keys(pkgJson.devDependencies)];

const sourceCode = ['src'];
const sourceCodeAbs = sourceCode.map((dir) => `${__dirname}/../${dir}`);
const sourceFiles = globby.sync(sourceCodeAbs);

const getPackagesUsedInCode = (content = '') => {
  const packages = [];
  // regex to find all packages in the "import" statements.
  // notice the flag "m" next to the "g" flag, it's for multi-line matching.
  // needed because I match only lines that start with "import".
  const regex = /^import.+from.+'(.+)'/gm;
  let match;
  while ((match = regex.exec(content))) {
    if (match[1].startsWith('.')) continue; // ignore local imports
    packages.push(match[1]);
  }
  return packages;
};

const usedPackages = sourceFiles.map((file) => {
  if (file.includes('.spec.') || file.includes('e2e-helper')) return []; // ignore test files
  const content = fs.readFileSync(file, 'utf8');
  const packages = getPackagesUsedInCode(content);
  return packages;
});

const uniqPackages = uniq(usedPackages.flat());

const buildInModules = require('module').builtinModules;
const whiteList = [];

const missingPackages = uniqPackages.filter(
  (pkg) => !pkgJsonDeps.includes(pkg) && !buildInModules.includes(pkg) && !whiteList.includes(pkg)
);
if (missingPackages.length) {
  console.error('missingPackages', missingPackages);
  process.exit(1);
}
