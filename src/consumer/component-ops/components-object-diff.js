// @flow
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import chalk from 'chalk';
import diff from 'object-diff';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import Component from '../component/consumer-component';
import type { FieldsDiff } from './components-diff';
import { Consumer } from '..';
import EnvExtension from '../../extensions/env-extension';

export function componentToPrintableForDiff(component: Component): Object {
  const obj = {};
  const parsePackages = (packages) => {
    return !R.isEmpty(packages) && !R.isNil(packages)
      ? Object.keys(packages).map(key => `${key}@${packages[key]}`)
      : null;
  };
  const parseEnvFiles = (envExtension: ?EnvExtension): ?(string[]) => {
    // $FlowFixMe sadly, Flow doesn't know what isNilOrEmpty does
    if (RA.isNilOrEmpty(envExtension) || RA.isNilOrEmpty(envExtension.files)) return null;
    // $FlowFixMe sadly, Flow doesn't know what isNilOrEmpty does
    return envExtension.files.map(file => `${file.name} => ${file.relative}`).sort();
  };
  const {
    lang,
    compiler,
    tester,
    dependencies,
    devDependencies,
    compilerDependencies,
    testerDependencies,
    packageDependencies,
    devPackageDependencies,
    compilerPackageDependencies,
    testerPackageDependencies,
    files,
    mainFile,
    deprecated
  } = component;
  const parsedDevPackageDependencies = parsePackages(devPackageDependencies) || [];
  const parsedCompilerPackageDependencies = parsePackages(compilerPackageDependencies) || [];
  const parsedTesterPackageDependencies = parsePackages(testerPackageDependencies) || [];
  const printableDevPackageDependencies = [
    ...parsedDevPackageDependencies,
    ...parsedCompilerPackageDependencies,
    ...parsedTesterPackageDependencies
  ];
  const printableCompilerDependencies = compilerDependencies.toStringOfIds();
  const printableTesterDependencies = testerDependencies.toStringOfIds();
  const peerPackageDependencies = [].concat(parsePackages(component.peerPackageDependencies)).filter(x => x);
  const overrides = component.overrides.componentOverridesData;

  obj.id = component.id.toStringWithoutScope();
  obj.compiler = compiler ? compiler.name : null;
  obj.compilerFiles = parseEnvFiles(compiler);
  obj.language = lang || null;
  obj.tester = tester ? tester.name : null;
  obj.testerFiles = parseEnvFiles(tester);
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies = dependencies
    .toStringOfIds()
    .sort()
    .concat(parsePackages(packageDependencies))
    .filter(x => x);
  obj.devDependencies = devDependencies
    .toStringOfIds()
    .sort()
    .concat(printableDevPackageDependencies)
    .concat(printableCompilerDependencies)
    .concat(printableTesterDependencies)
    .filter(x => x);
  obj.peerDependencies = peerPackageDependencies.length ? peerPackageDependencies : undefined;

  obj.files =
    files && !R.isEmpty(files) && !R.isNil(files)
      ? files.filter(file => !file.test).map(file => normalize(file.relative))
      : null;
  obj.specs =
    files && !R.isEmpty(files) && !R.isNil(files) && R.find(R.propEq('test', true))(files)
      ? files.filter(file => file.test).map(file => normalize(file.relative))
      : null;
  obj.deprecated = deprecated ? 'True' : null;
  obj.overridesDependencies = parsePackages(overrides.dependencies);
  obj.overridesDevDependencies = parsePackages(overrides.devDependencies);
  obj.overridesPeerDependencies = parsePackages(overrides.peerDependencies);
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
  componentRight: Component,
  verbose: boolean
): ?(FieldsDiff[]) {
  const printableLeft = componentToPrintableForDiff(componentLeft);
  const printableRight = componentToPrintableForDiff(componentRight);
  const fieldsDiff = getDiffBetweenObjects(printableLeft, printableRight);
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
  const fieldsDiffOutput = Object.keys(fieldsDiff).map((field: string) => {
    const title = titleLeft(field) + chalk.bold(titleRight(field));
    const value = chalk.red(printFieldLeft(field)) + chalk.green(printFieldRight(field));
    const diffOutput = title + value;
    return { fieldName: field, diffOutput };
  });

  const dependenciesOutput = () => {
    if (!verbose) return [];
    const dependenciesLeft = componentLeft.getAllDependencies();
    const dependenciesRight = componentRight.getAllDependencies();
    if (R.isEmpty(dependenciesLeft) || R.isEmpty(dependenciesRight)) return [];
    return dependenciesLeft.reduce((acc, dependencyLeft) => {
      const idStr = dependencyLeft.id.toString();
      const dependencyRight = dependenciesRight.find(dep => dep.id.isEqual(dependencyLeft.id));
      if (!dependencyRight) return acc;
      if (JSON.stringify(dependencyLeft.relativePaths) === JSON.stringify(dependencyRight.relativePaths)) return acc;
      const fieldName = `Dependency ${idStr} relative-paths`;
      const title = titleLeft(fieldName) + chalk.bold(titleRight(fieldName));
      const getValue = (fieldValue: Object, left: boolean) => {
        if (R.isEmpty(fieldValue)) return '';
        const sign = left ? '-' : '+';
        const jsonOutput = JSON.stringify(fieldValue, null, `${sign} `);
        return `${jsonOutput}\n`;
      };
      const value =
        chalk.red(getValue(dependencyLeft.relativePaths, true)) +
        chalk.green(getValue(dependencyRight.relativePaths, false));
      const diffOutput = title + value;
      acc.push({ fieldName, diffOutput });
      return acc;
    }, []);
  };

  const envs = ['compiler', 'tester'];
  const fieldsEnvsConfigOutput = envs
    .map((env: string) => {
      // $FlowFixMe
      const leftConfig = componentLeft[env] && componentLeft[env].dynamicConfig ? componentLeft[env].dynamicConfig : {};
      const rightConfig = // $FlowFixMe
        componentRight[env] && componentRight[env].dynamicConfig ? componentRight[env].dynamicConfig : {};
      // $FlowFixMe we remove the null later
      if (JSON.stringify(leftConfig) === JSON.stringify(rightConfig)) return null;
      const fieldName = `${env} configuration`;
      const title = titleLeft(fieldName) + chalk.bold(titleRight(fieldName));
      const getValue = (fieldValue: Object, left: boolean) => {
        if (R.isEmpty(fieldValue)) return '';
        const sign = left ? '-' : '+';
        const jsonOutput = JSON.stringify(fieldValue, null, `${sign} `);
        return `${jsonOutput}\n`;
      };
      const value = chalk.red(getValue(leftConfig, true)) + chalk.green(getValue(rightConfig, false));

      const diffOutput = title + value;
      return { fieldName, diffOutput };
    })
    .filter(x => x);

  const allDiffs = [...fieldsDiffOutput, ...fieldsEnvsConfigOutput, ...dependenciesOutput()];
  return R.isEmpty(allDiffs) ? undefined : allDiffs;
}
