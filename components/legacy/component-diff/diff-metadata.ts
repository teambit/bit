import arrayDifference from 'array-difference';
import tempy from 'tempy';
import chalk from 'chalk';
import Table from 'cli-table';
import diff from 'object-diff';
import { compact, isEmpty, union } from 'lodash';
import { lt, gt } from 'semver';
import type { ComponentIdList } from '@teambit/component-id';
import type { DiffOptions, FieldsDiff } from './components-diff';
import { getOneFileDiff } from './format-file-diff';

export type DiffMetadata = {
  printable: Record<string, any>;
  version?: string;
  packageDependencies: Record<string, string>;
  devPackageDependencies: Record<string, string>;
  peerPackageDependencies: Record<string, string>;
  depsIdsGroupedByType: Record<string, ComponentIdList>;
  peerDependenciesIds: () => ComponentIdList;
  extensionConfigs: () => Record<string, any>;
};
type ConfigDiff = { fieldName: string; diffOutput: string };
type DepDiffType = 'added' | 'removed' | 'upgraded' | 'downgraded' | 'changed';
type DepDiff = { name: string; type: DepDiffType; left?: string; right?: string };

export function prettifyFieldName(field: string): string {
  return `${field[0].toUpperCase()}${field.slice(1)}`.replace(/([A-Z])/g, ' $1').trim();
}

function comparator(a, b) {
  if (a instanceof Array && b instanceof Array) {
    return isEmpty(arrayDifference(a, b));
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

export async function diffMetadata(
  componentLeft: DiffMetadata,
  componentRight: DiffMetadata,
  { formatDepsAsTable }: DiffOptions
): Promise<FieldsDiff[] | undefined> {
  const printableLeft = componentLeft.printable;
  const printableRight = componentRight.printable;
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

  const getDepDiffType = (left?: string, right?: string): DepDiffType => {
    if (left && !right) return 'removed';
    if (!left && right) return 'added';
    if (!left || !right) throw new Error('diff.getType expect at least one of the component to have value');
    const opts = { loose: true, includePrerelease: true };
    try {
      if (lt(left, right, opts)) return 'upgraded';
      if (gt(left, right, opts)) return 'downgraded';
    } catch {
      // the semver is probably a range, no need to compare, just fallback to the "changed"
    }
    return 'changed';
  };

  const formatDepsDiffAsTable = (diffs: DepDiff[], fieldName: string): string => {
    diffs.forEach((oneDiff) => {
      // oneDiff.name = `> ${oneDiff.name}`;
      oneDiff.left = oneDiff.left || '---';
      oneDiff.right = oneDiff.right || '---';
    });
    const diffTable = new Table({
      head: ['name', 'diff', `${leftVersion}`, `${rightVersion}`],
      style: { head: ['cyan'] },
    });
    diffs.map((dif) => diffTable.push(Object.values(dif)));
    return `\n${chalk.bold(fieldName)}\n${diffTable.toString()}`;
  };

  const formatDepsDiffAsPlainText = (diffs: DepDiff[], fieldName: string): string => {
    diffs.forEach((oneDiff) => {
      oneDiff.left = oneDiff.left ? chalk.red(`- ${oneDiff.name}@${oneDiff.left}\n`) : '';
      oneDiff.right = oneDiff.right ? chalk.green(`+ ${oneDiff.name}@${oneDiff.right}\n`) : '';
    });
    const output = diffs.map((d) => `${d.name}\n${d.left}${d.right}`).join('\n');
    const depTitleLeft = `--- ${fieldName} ${labelLeft(leftVersion, rightVersion)}`;
    const depTitleRight = `+++ ${fieldName} ${labelRight(leftVersion, rightVersion)}`;
    const title = `${depTitleLeft}\n${chalk.bold(depTitleRight)}`;

    return `\n${title}\n${output}`;
  };

  const formatDepsDiff = (diffs: DepDiff[], fieldName: string): string => {
    return formatDepsAsTable ? formatDepsDiffAsTable(diffs, fieldName) : formatDepsDiffAsPlainText(diffs, fieldName);
  };

  const packageDependenciesOutput = (fieldName: string): string | null => {
    const dependenciesLeft = componentLeft[fieldName];
    const dependenciesRight = componentRight[fieldName];
    if (isEmpty(dependenciesLeft) && isEmpty(dependenciesRight)) return null;
    const diffsLeft = Object.keys(dependenciesLeft).reduce<DepDiff[]>((acc, dependencyName) => {
      const dependencyLeft = dependenciesLeft[dependencyName];
      const dependencyRight = dependenciesRight[dependencyName];
      if (dependencyLeft === dependencyRight) return acc;

      acc.push({
        name: dependencyName,
        type: getDepDiffType(dependencyLeft, dependencyRight),
        left: dependencyLeft,
        right: dependencyRight,
      });
      return acc;
    }, []);
    const diffs = Object.keys(dependenciesRight).reduce<DepDiff[]>((acc, dependencyName) => {
      if (!dependenciesLeft[dependencyName]) {
        // otherwise it was taken care already above
        acc.push({
          name: dependencyName,
          type: getDepDiffType(undefined, dependenciesRight[dependencyName]),
          left: undefined,
          right: dependenciesRight[dependencyName],
        });
      }
      return acc;
    }, diffsLeft);
    if (!diffs.length) return null;

    return formatDepsDiff(diffs, fieldName);
  };

  const componentDependenciesOutput = (fieldName: string): string | null => {
    const dependenciesLeft: ComponentIdList =
      fieldName === 'peerDependencies'
        ? componentLeft.peerDependenciesIds()
        : componentLeft.depsIdsGroupedByType[fieldName];
    const dependenciesRight: ComponentIdList =
      fieldName === 'peerDependencies'
        ? componentRight.peerDependenciesIds()
        : componentRight.depsIdsGroupedByType[fieldName];
    if (isEmpty(dependenciesLeft) && isEmpty(dependenciesRight)) return null;
    const diffsLeft = dependenciesLeft.reduce<DepDiff[]>((acc, dependencyLeft) => {
      const dependencyRight = dependenciesRight.searchWithoutVersion(dependencyLeft);
      if (dependencyRight && dependencyLeft.isEqual(dependencyRight)) return acc;

      acc.push({
        name: dependencyLeft.toStringWithoutVersion(),
        type: getDepDiffType(dependencyLeft.version, dependencyRight?.version),
        left: dependencyLeft.version,
        right: dependencyRight?.version,
      });
      return acc;
    }, []);
    const diffs = dependenciesRight.reduce<DepDiff[]>((acc, dependencyRight) => {
      if (!dependenciesLeft.hasWithoutVersion(dependencyRight)) {
        // otherwise it was taken care already above
        acc.push({
          name: dependencyRight.toStringWithoutVersion(),
          type: getDepDiffType(undefined, dependencyRight.version),
          left: undefined,
          right: dependencyRight?.version,
        });
      }
      return acc;
    }, diffsLeft);
    if (!diffs.length) return null;

    return formatDepsDiff(diffs, fieldName);
  };

  const getAllDepsOutput = (): FieldsDiff[] => {
    const depsDiff: FieldsDiff[] = [];
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((fieldName) => {
      const diffOutput = packageDependenciesOutput(fieldName);
      if (diffOutput) depsDiff.push({ fieldName, diffOutput });
    });
    ['dependencies', 'devDependencies', 'peerDependencies', 'extensionDependencies'].forEach((fieldName) => {
      const diffOutput = componentDependenciesOutput(fieldName);
      if (diffOutput) depsDiff.push({ fieldName, diffOutput });
    });

    return depsDiff;
  };

  const extensionsConfigOutput = await getExtensionsConfigOutput(componentLeft, componentRight);

  const allDiffs = [...fieldsDiffOutput, ...extensionsConfigOutput, ...getAllDepsOutput()];

  return isEmpty(allDiffs) ? undefined : allDiffs;
}

async function getExtensionsConfigOutput(
  componentLeft: DiffMetadata,
  componentRight: DiffMetadata
): Promise<ConfigDiff[]> {
  const leftExtensionsConfigs = componentLeft.extensionConfigs();
  const rightExtensionsConfigs = componentRight.extensionConfigs();
  const leftExtensionsIds = Object.keys(leftExtensionsConfigs);
  const rightExtensionsIds = Object.keys(rightExtensionsConfigs);

  // const mutualIds = R.intersection(rightExtensionsIds, rightExtensionsIds);
  // const onlyOnOneIds = R.symmetricDifference(leftExtensionsIds, rightExtensionsIds);
  const allIds = union(leftExtensionsIds, rightExtensionsIds);

  const allIdsOutput = await Promise.all(
    allIds.map((extId) => {
      const leftConfig = leftExtensionsConfigs[extId];
      const rightConfig = rightExtensionsConfigs[extId];
      const fieldName = `${extId} configuration`;
      return configsOutput(fieldName, leftConfig, rightConfig, componentLeft.version, componentRight.version);
    })
  );

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

async function configsOutput(
  fieldName: string,
  leftConfig?: Record<string, any>,
  rightConfig?: Record<string, any>,
  leftVersion?: string,
  rightVersion?: string
): Promise<ConfigDiff | undefined> {
  if (!leftConfig && !rightConfig) return undefined;
  if (leftConfig && rightConfig && JSON.stringify(leftConfig) === JSON.stringify(rightConfig)) return undefined;

  const getConfigAsFilePath = async (config?: Record<string, any>) => {
    const str = config ? JSON.stringify(config, undefined, 2) : '';
    return tempy.write(str, { extension: 'js' });
  };

  const fileAPath = await getConfigAsFilePath(leftConfig);
  const fileBPath = await getConfigAsFilePath(rightConfig);
  const fileALabel = labelLeft(leftVersion, rightVersion) || '';
  const fileBLabel = chalk.bold(labelRight(leftVersion, rightVersion) || '');

  const diffOutput = await getOneFileDiff(fileAPath, fileBPath, fileALabel, fileBLabel, fieldName, true);

  return { fieldName, diffOutput };
}
