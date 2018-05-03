// @flow
import R from 'ramda';
import chalk from 'chalk';
import diff from 'object-diff';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import Component from '../component/consumer-component';
import type { FieldsDiff } from './components-diff';
import { COMPONENT_ORIGINS } from '../../constants';
import { Consumer } from '..';

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
  obj.dependencies = dependencies
    .toStringOfIds()
    .concat(parsePackages(packageDependencies))
    .filter(x => x);
  obj.devDependencies = devDependencies
    .toStringOfIds()
    .concat(parsePackages(devPackageDependencies))
    .filter(x => x);
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

export function prettifyFieldName(field: string): string {
  return `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
}

function comparator(a, b) {
  if (a instanceof Array && b instanceof Array) {
    return R.isEmpty(arrayDifference(a, b));
  }
  return a === b;
}

export function getDiffBetweenObjects(objectLeft: Object, objectRight: Object): Object {
  return diff.custom(
    {
      equal: comparator
    },
    objectLeft,
    objectRight
  );
}

export function diffBetweenModelAndFS(consumer: Consumer, component: Component): ?(FieldsDiff[]) {
  const componentFromModel = component.componentFromModel;
  if (!componentFromModel) throw new Error('diffBetweenFSandModel: componentFromModel is missing');
  if (!component.componentMap) throw new Error('diffBetweenFSandModel: componentMap is missing');
  if (component.componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
    component.stripOriginallySharedDir(consumer.bitMap);
    componentFromModel.stripOriginallySharedDir(consumer.bitMap);
  }
  const printableFromFS = componentToPrintableForDiff(component);
  const printableFromModel = componentToPrintableForDiff(componentFromModel);
  const otherFieldsDiff = getDiffBetweenObjects(printableFromFS, printableFromModel);
  if (!otherFieldsDiff || R.isEmpty(otherFieldsDiff)) return undefined;
  if (!component.version) throw new Error('diffBetweenFSandModel component does not have a version');
  const labelLeft = `${component.version} original`;
  const labelRight = `${component.version} modified`;
  const titleLeft = (field: string): string => `--- ${prettifyFieldName(field)} (${labelLeft})\n`;
  const titleRight = (field: string): string => `+++ ${prettifyFieldName(field)} (${labelRight})\n`;
  const printFieldValue = (fieldValue: string | Array<string>): string => {
    if (typeof fieldValue === 'string') return fieldValue;
    if (Array.isArray(fieldValue)) return `[ ${fieldValue.join(', ')} ]`;
    throw new Error(`diffBetweenFSandModel: not support ${typeof fieldValue}`);
  };
  const printFieldLeft = (field: string): string => {
    const fieldValue = printableFromModel[field];
    if (!fieldValue) return '';
    return `- ${printFieldValue(fieldValue)}\n`;
  };
  const printFieldRight = (field: string): string => {
    const fieldValue = printableFromFS[field];
    if (!fieldValue) return '';
    return `+ ${printFieldValue(fieldValue)}\n`;
  };
  return Object.keys(otherFieldsDiff).map((field: string) => {
    const title = titleLeft(field) + chalk.bold(titleRight(field));
    const value = chalk.red(printFieldLeft(field)) + chalk.green(printFieldRight(field));
    const diffOutput = title + value;
    return { fieldName: field, diffOutput };
  });
}
