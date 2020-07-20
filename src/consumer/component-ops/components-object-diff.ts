import R from 'ramda';
import { compact } from 'ramda-adjunct';
import chalk from 'chalk';
import diff from 'object-diff';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import Component from '../component/consumer-component';
import { FieldsDiff } from './components-diff';
import { Consumer } from '..';
import { ExtensionDataList } from '../config';

type ConfigDiff = {
  fieldName: string;
  diffOutput: string;
};
export function componentToPrintableForDiff(component: Component): Record<string, any> {
  const obj = {};
  const parsePackages = (packages) => {
    return !R.isEmpty(packages) && !R.isNil(packages)
      ? Object.keys(packages).map((key) => `${key}@${packages[key]}`)
      : null;
  };

  const parseExtensions = (extensions?: ExtensionDataList) => {
    if (!extensions || R.isEmpty(extensions)) return null;
    return extensions.map((extension) => extension.stringId);
  };

  const {
    lang,
    bindingPrefix,
    compiler,
    tester,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    compilerPackageDependencies,
    testerPackageDependencies,
    files,
    extensions,
    mainFile,
    deprecated,
  } = component;
  const allDevPackages = {
    ...devPackageDependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...compilerPackageDependencies.devDependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...testerPackageDependencies.devDependencies,
  };
  const allPackages = {
    ...packageDependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...compilerPackageDependencies.dependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...testerPackageDependencies.dependencies,
  };
  const allPeerPackages = {
    ...component.peerPackageDependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...compilerPackageDependencies.peerDependencies,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...testerPackageDependencies.peerDependencies,
  };
  const parsedDevPackageDependencies = parsePackages(allDevPackages) || [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const peerPackageDependencies = [].concat(parsePackages(allPeerPackages)).filter((x) => x);
  const overrides = component.overrides.componentOverridesData;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.id = component.id.toStringWithoutScope();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.compiler = compiler ? compiler.name : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.language = lang || null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.bindingPrefix = bindingPrefix || null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.tester = tester ? tester.name : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.dependencies = dependencies
    .toStringOfIds()
    .sort()
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    .concat(parsePackages(allPackages))
    .filter((x) => x);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.devDependencies = devDependencies
    .toStringOfIds()
    .sort()
    .concat(parsedDevPackageDependencies)
    .filter((x) => x);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.peerDependencies = peerPackageDependencies.length ? peerPackageDependencies : undefined;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.files =
    files && !R.isEmpty(files) && !R.isNil(files)
      ? // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        files.filter((file) => !file.test).map((file) => normalize(file.relative))
      : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.specs =
    files && !R.isEmpty(files) && !R.isNil(files) && R.find(R.propEq('test', true))(files)
      ? // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        files.filter((file) => file.test).map((file) => normalize(file.relative))
      : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.extensions = parseExtensions(extensions);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.deprecated = deprecated ? 'True' : null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.overridesDependencies = parsePackages(overrides.dependencies);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.overridesDevDependencies = parsePackages(overrides.devDependencies);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.overridesPeerDependencies = parsePackages(overrides.peerDependencies);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  obj.overridesPackageJsonProps = JSON.stringify(component.overrides.componentOverridesPackageJsonData);
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

export function getDiffBetweenObjects(
  objectLeft: Record<string, any>,
  objectRight: Record<string, any>
): Record<string, any> {
  return diff.custom(
    {
      equal: comparator,
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
): FieldsDiff[] | null | undefined {
  const printableLeft = componentToPrintableForDiff(componentLeft);
  const printableRight = componentToPrintableForDiff(componentRight);
  const leftVersion = componentLeft.version;
  const rightVersion = componentRight.version;
  const fieldsDiff = getDiffBetweenObjects(printableLeft, printableRight);
  if (!componentLeft.version || !componentRight.version) {
    throw new Error('diffBetweenComponentsObjects component does not have a version');
  }

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
    const title =
      titleLeft(field, leftVersion, rightVersion) + chalk.bold(titleRight(field, leftVersion, rightVersion));
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
      const dependencyRight = dependenciesRight.find((dep) => dep.id.isEqual(dependencyLeft.id));
      if (!dependencyRight) return acc;
      if (JSON.stringify(dependencyLeft.relativePaths) === JSON.stringify(dependencyRight.relativePaths)) return acc;
      const fieldName = `Dependency ${idStr} relative-paths`;
      const title =
        titleLeft(fieldName, leftVersion, rightVersion) + chalk.bold(titleRight(fieldName, leftVersion, rightVersion));
      const getValue = (fieldValue: Record<string, any>, left: boolean) => {
        if (R.isEmpty(fieldValue)) return '';
        const sign = left ? '-' : '+';
        const jsonOutput = JSON.stringify(fieldValue, null, `${sign} `);
        return `${jsonOutput}\n`;
      };
      const value =
        chalk.red(getValue(dependencyLeft.relativePaths, true)) +
        chalk.green(getValue(dependencyRight.relativePaths, false));
      const diffOutput = title + value;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc.push({ fieldName, diffOutput });
      return acc;
    }, []);
  };

  const fieldsEnvsConfigOutput = getEnvsConfigOutput(componentLeft, componentRight);
  const extensionsConfigOutput = getExtensionsConfigOutput(componentLeft, componentRight);

  const allDiffs = [...fieldsDiffOutput, ...fieldsEnvsConfigOutput, ...extensionsConfigOutput, ...dependenciesOutput()];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return R.isEmpty(allDiffs) ? undefined : allDiffs;
}

function getEnvsConfigOutput(componentLeft: Component, componentRight: Component): Array<ConfigDiff> {
  const envs = ['compiler', 'tester'];
  const fieldsEnvsConfigOutput = envs.map((env: string) => {
    const leftConfig = componentLeft[env] && componentLeft[env].dynamicConfig ? componentLeft[env].dynamicConfig : {};
    const rightConfig =
      componentRight[env] && componentRight[env].dynamicConfig ? componentRight[env].dynamicConfig : {};
    if (JSON.stringify(leftConfig) === JSON.stringify(rightConfig)) return undefined;
    const fieldName = `${env} configuration`;
    return configsOutput(fieldName, leftConfig, rightConfig, componentLeft.version, componentRight.version);
  });
  return compact(fieldsEnvsConfigOutput);
}

function getExtensionsConfigOutput(componentLeft: Component, componentRight: Component): Array<ConfigDiff> {
  const leftExtensionsConfigs = componentLeft.extensions.sortById().toConfigObject();
  const rightExtensionsConfigs = componentRight.extensions.sortById().toConfigObject();
  const leftExtensionsIds = Object.keys(leftExtensionsConfigs);
  const rightExtensionsIds = Object.keys(rightExtensionsConfigs);

  // const mutualIds = R.intersection(rightExtensionsIds, rightExtensionsIds);
  // const onlyOnOneIds = R.symmetricDifference(leftExtensionsIds, rightExtensionsIds);
  const allIds = R.union(leftExtensionsIds, rightExtensionsIds);

  const allIdsOutput = allIds.map((extId) => {
    const leftConfig = leftExtensionsConfigs[extId];
    const rightConfig = rightExtensionsConfigs[extId];
    const fieldName = `${extId} configuration`;
    return configsOutput(fieldName, leftConfig, rightConfig, componentLeft.version, componentRight.version);
  });

  return compact(allIdsOutput);
}

function labelLeft(leftVersion?: string, rightVersion?: string) {
  const sameVersions = areVersionsTheSame(leftVersion, rightVersion);
  return sameVersions ? `${leftVersion} original` : leftVersion;
}

function labelRight(leftVersion?: string, rightVersion?: string) {
  const sameVersions = areVersionsTheSame(leftVersion, rightVersion);
  return sameVersions ? `${rightVersion} modified` : rightVersion;
}

function areVersionsTheSame(leftVersion?: string, rightVersion?: string) {
  return leftVersion === rightVersion;
}

function titleLeft(field: string, leftVersion?: string, rightVersion?: string): string {
  const leftLabel = labelLeft(leftVersion, rightVersion);
  return `--- ${prettifyFieldName(field)} (${leftLabel})\n`;
}
function titleRight(field: string, leftVersion?: string, rightVersion?: string): string {
  const rightLabel = labelRight(leftVersion, rightVersion);
  return `+++ ${prettifyFieldName(field)} (${rightLabel})\n`;
}

function configsOutput(
  fieldName: string,
  leftConfig?: Record<string, any>,
  rightConfig?: Record<string, any>,
  leftVersion?: string,
  rightVersion?: string
): ConfigDiff | undefined {
  if (!leftConfig && !rightConfig) return undefined;
  if (leftConfig && rightConfig && JSON.stringify(leftConfig) === JSON.stringify(rightConfig)) return undefined;
  const title =
    titleLeft(fieldName, leftVersion, rightVersion) + chalk.bold(titleRight(fieldName, leftVersion, rightVersion));
  const getValue = (left: boolean, fieldValue?: Record<string, any>) => {
    if (fieldValue === undefined || R.isEmpty(fieldValue)) return '';
    const sign = left ? '-' : '+';
    const jsonOutput = JSON.stringify(fieldValue, null, `${sign} `);
    return `${jsonOutput}\n`;
  };
  const value = chalk.red(getValue(true, leftConfig)) + chalk.green(getValue(false, rightConfig));

  const diffOutput = title + value;
  return { fieldName, diffOutput };
}
