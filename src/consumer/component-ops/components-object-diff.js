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
    compiler,
    tester,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    envsPackageDependencies,
    files,
    mainFile,
    deprecated
  } = component;
  const parsedDevPackageDependencies = parsePackages(devPackageDependencies) || [];
  const parsedEnvsPackageDependencies = parsePackages(envsPackageDependencies) || [];
  const printableDevPackageDependencies = parsedDevPackageDependencies.concat(parsedEnvsPackageDependencies);

  obj.id = component.id.toStringWithoutScope();
  obj.compiler = compiler ? compiler.name : null;
  obj.language = lang || null;
  obj.tester = tester ? tester.name : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies = dependencies
    .toStringOfIds()
    .concat(parsePackages(packageDependencies))
    .filter(x => x);
  obj.devDependencies = devDependencies
    .toStringOfIds()
    .concat(printableDevPackageDependencies)
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

export function diffBetweenComponentsObjects(
  consumer: Consumer,
  componentLeft: Component,
  componentRight: Component
): ?(FieldsDiff[]) {
  const componentMap = consumer.bitMap.getComponent(componentLeft.id, false, true);
  if (componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
    componentLeft.stripOriginallySharedDir(consumer.bitMap);
    componentRight.stripOriginallySharedDir(consumer.bitMap);
  }
  const printableLeft = componentToPrintableForDiff(componentLeft);
  const printableRight = componentToPrintableForDiff(componentRight);
  const otherFieldsDiff = getDiffBetweenObjects(printableLeft, printableRight);
  if (!otherFieldsDiff || R.isEmpty(otherFieldsDiff)) return undefined;
  if (!componentLeft.version || !componentRight.version) {
    throw new Error('diffBetweenComponentsObjects component does not have a version');
  }
  const areVersionsTheSame = componentLeft.version === componentRight.version;
  const labelLeft = areVersionsTheSame ? `${componentLeft.version} original` : componentLeft.version;
  const labelRight = areVersionsTheSame ? `${componentRight.version} modified` : componentRight.version;
  const titleLeft = (field: string): string => `--- ${prettifyFieldName(field)} (${labelLeft})\n`;
  const titleRight = (field: string): string => `+++ ${prettifyFieldName(field)} (${labelRight})\n`;
  const printFieldValue = (fieldValue: string | Array<string>): string => {
    if (typeof fieldValue === 'string') return fieldValue;
    if (Array.isArray(fieldValue)) return `[ ${fieldValue.join(', ')} ]`;
    throw new Error(`diffBetweenComponentsObjects: not support ${typeof fieldValue}`);
  };
  const printFieldLeft = (field: string): string => {
    const fieldValue = printableLeft[field];
    if (!fieldValue) return '';
    return `- ${printFieldValue(fieldValue)}\n`;
  };
  const printFieldRight = (field: string): string => {
    const fieldValue = printableRight[field];
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
