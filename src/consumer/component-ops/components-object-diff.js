// @flow
import R from 'ramda';
import diff from 'object-diff';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import Component from '../component/consumer-component';

export function componentToPrintableForDiff(component: Component): Object {
  const obj = {};
  const parsePackages = (packages) => {
    return !R.isEmpty(packages) && !R.isNil(packages)
      ? Object.keys(packages).map(key => `${key}@${packages[key]}`)
      : null;
  };
  const {
    lang,
    compilerId,
    testerId,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    files,
    mainFile,
    deprecated,
    docs
  } = component;

  obj.id = component.id.toStringWithoutScope();
  obj.compiler = compilerId ? compilerId.toString() : null;
  obj.language = lang || null;
  obj.tester = testerId ? testerId.toString() : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies = dependencies.toStringOfIds().concat(parsePackages(packageDependencies));
  obj.devDependencies = devDependencies.toStringOfIds().concat(parsePackages(devPackageDependencies));
  obj.peerDependencies = parsePackages(peerPackageDependencies);

  obj.files =
    files && !R.isEmpty(files) && !R.isNil(files)
      ? files.filter(file => !file.test).map(file => normalize(file.relative))
      : null;
  obj.specs =
    files && !R.isEmpty(files) && !R.isNil(files) && R.find(R.propEq('test', true))(files)
      ? files.filter(file => file.test).map(file => normalize(file.relative))
      : null;
  obj.deprecated = deprecated ? 'True' : null;
  obj.docs = docs;
  return obj;
}

function comparator(a, b) {
  if (a instanceof Array && b instanceof Array) {
    return R.isEmpty(arrayDifference(a, b));
  }
  return a === b;
}

export function getDiffBetweenObjects(objectA: Object, objectB: Object): Object {
  return diff.custom(
    {
      equal: comparator
    },
    objectA,
    objectB
  );
}
