/** @flow */
import R from 'ramda';
import c from 'chalk';
import diff from 'object-diff';
import { table } from 'table';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import rightpad from 'pad-right';

import ConsumerComponent from '../../consumer/component/consumer-component';
import paintDocumentation from './docs-template';

const COLUMN_WIDTH = 50;
const tableColumnConfig = {
  columns: {
    // $FlowFixMe
    1: {
      alignment: 'left',
      width: COLUMN_WIDTH
    },
    // $FlowFixMe
    2: {
      alignment: 'left',
      width: COLUMN_WIDTH
    }
  }
};

const fields = [
  'id',
  'compiler',
  'tester',
  'language',
  'mainFile',
  'dependencies',
  'devDependencies',
  'packages',
  'devPackages',
  'peerDependencies',
  'files',
  'specs',
  'deprecated'
];

function comparator(a, b) {
  if (a instanceof Array && b instanceof Array) {
    return R.isEmpty(arrayDifference(a, b));
  }
  return a === b;
}

function convertObjectToPrintable(component: ConsumerComponent, isFromFs) {
  const obj = {};
  const parsePackages = (packages) => {
    return !R.isEmpty(packages) && !R.isNil(packages)
      ? Object.keys(packages).map(key => `${key}@${packages[key]}`)
      : null;
  };
  const {
    name,
    box,
    lang,
    compiler,
    tester,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    files,
    mainFile,
    deprecated,
    version,
    docs
  } = component;

  const ver = version ? `@${version}` : '';
  obj.id = isFromFs ? `${box}/${name}${ver} [file system]` : `${box}/${name}${ver}`;
  // TODO: Gilad - print compiler config in different table
  obj.compiler = compiler ? compiler.name : null;
  obj.language = lang || null;
  obj.tester = tester ? tester.name : null;
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

function generateDependenciesTable(component: ConsumerComponent, showRemoteVersion) {
  if (!component.hasDependencies()) {
    return '';
  }

  const dependencyHeader = [];
  if (showRemoteVersion) {
    dependencyHeader.push(['Dependency ID', 'Current Version', 'Local Version', 'Remote Version']);
  } else {
    dependencyHeader.push(['Dependencies']);
  }
  const getDependenciesRows = (dependencies, isDev: boolean = false) => {
    const dependencyRows = [];
    dependencies.forEach((dependency) => {
      let dependencyId = showRemoteVersion ? dependency.id.toStringWithoutVersion() : dependency.id.toString();
      dependencyId = isDev ? `${dependencyId} (dev)` : dependencyId;
      const row = [dependencyId];
      if (showRemoteVersion) {
        const dependencyVersion = dependency.currentVersion;
        const localVersion = dependency.localVersion;
        const remoteVersion = dependency.remoteVersion ? dependency.remoteVersion : null;
        // if all versions are equal, paint them with green. Otherwise, paint with red
        const color =
          (remoteVersion && remoteVersion === localVersion && remoteVersion === dependencyVersion) ||
          (!remoteVersion && localVersion === dependencyVersion)
            ? 'green'
            : 'red';
        row.push(c[color](dependencyVersion));
        row.push(c[color](localVersion));
        row.push(remoteVersion ? c[color](remoteVersion) : 'N/A');
      }
      dependencyRows.push(row);
    });
    return dependencyRows;
  };
  const dependenciesRows = getDependenciesRows(component.dependencies.get());
  const devDependenciesRows = getDependenciesRows(component.devDependencies.get(), true);
  const allDependenciesRows = R.concat(dependenciesRows, devDependenciesRows);

  const dependenciesTable = table(dependencyHeader.concat(allDependenciesRows));
  return dependenciesTable;
}

function calculatePadRightLength(str: string, columnWidth: number): string {
  if (!str) return '';
  const padRightCount = Math.ceil(str.length / columnWidth) * columnWidth;
  return str.length > columnWidth ? rightpad(str, padRightCount, ' ') : rightpad(str, columnWidth, ' ');
}

function paintWithoutCompare(component: ConsumerComponent, showRemoteVersion: boolean) {
  const printableComponent = convertObjectToPrintable(component, false);
  const rows = fields
    .map((field) => {
      const arr = [];

      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      if (!printableComponent[field]) return null;

      arr.push(c.cyan(title));
      if (!printableComponent[field]) return null;

      if (printableComponent[field]) {
        if (printableComponent[field] instanceof Array) {
          arr.push(
            printableComponent[field]
              .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
              .join(' ')
              .trim()
          );
        } else arr.push(printableComponent[field]);
      }
      return arr;
    })
    .filter(x => x);

  const componentTable = table(rows, tableColumnConfig);
  const dependenciesTableStr = showRemoteVersion ? generateDependenciesTable(component, showRemoteVersion) : '';
  return componentTable + dependenciesTableStr + paintDocumentation(component.docs);
}

function paintWithCompare(
  originalComponent: ConsumerComponent,
  componentToCompareTo: ConsumerComponent,
  showRemoteVersion: boolean
) {
  const printableOriginalComponent = convertObjectToPrintable(originalComponent, true);
  const printableComponentToCompare = convertObjectToPrintable(componentToCompareTo, false);

  const componentsDiffs = diff.custom(
    {
      equal: comparator
    },
    printableOriginalComponent,
    printableComponentToCompare
  );

  const rows = fields
    .map((field) => {
      const arr = [];
      if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      arr.push(field in componentsDiffs && field !== 'id' ? c.red(title) : c.cyan(title));
      if (printableComponentToCompare[field] instanceof Array) {
        arr.push(
          printableComponentToCompare[field]
            .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
            .join(' ')
            .trim()
        );
      } else {
        arr.push(printableComponentToCompare[field]);
      }
      if (printableOriginalComponent[field] instanceof Array) {
        arr.push(
          printableOriginalComponent[field]
            .map(str => calculatePadRightLength(str, COLUMN_WIDTH))
            .join(' ')
            .trim()
        );
      } else {
        arr.push(printableOriginalComponent[field]);
      }
      return arr;
    })
    .filter(x => x);

  const componentTable = table(rows, tableColumnConfig);
  const dependenciesTableStr = !componentToCompareTo
    ? generateDependenciesTable(originalComponent, showRemoteVersion)
    : '';
  return componentTable + dependenciesTableStr;
}

export default (component: ConsumerComponent, componentModel?: ConsumerComponent, showRemoteVersion: boolean) => {
  return componentModel
    ? paintWithCompare(component, componentModel, showRemoteVersion)
    : paintWithoutCompare(component, showRemoteVersion);
};
