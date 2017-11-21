// @flow
import R from 'ramda';
import c from 'chalk';
import diff from 'object-diff';
import Table from 'tty-table';
import normalize from 'normalize-path';
import arrayDifference from 'array-difference';
import ConsumerComponent from '../../consumer/component/consumer-component';
import paintDocumentation from './docs-template';

const fields = [
  'id',
  'compiler',
  'tester',
  'language',
  'mainFile',
  'dependencies',
  'packages',
  'files',
  'specs',
  'deprecated'
];

const header = [{ value: 'ID', width: 20, headerColor: 'cyan' }];
const opts = {
  borderStyle: 1,
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 1,
  align: 'center',
  color: 'white'
};
function comparator(a, b) {
  if (a instanceof Array && b instanceof Array) {
    return R.isEmpty(arrayDifference(a, b));
  }
  return a === b;
}

function convertObjectToPrintable(component, isFromFs, includeDependecies = false) {
  const obj = {};
  const {
    name,
    box,
    lang,
    compilerId,
    testerId,
    dependencies,
    packageDependencies,
    files,
    mainFile,
    deprecated,
    version,
    docs
  } = component;
  obj.id = isFromFs ? `${box}/${name}@${version} \n[file system]` : `${box}/${name}@${version}`;
  obj.compiler = compilerId ? compilerId.toString() : null;
  obj.language = lang || null;
  obj.tester = testerId ? testerId.toString() : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  if (includeDependecies) obj.dependencies = dependencies.map(dep => dep.id.toString());
  obj.packages =
    !R.isEmpty(packageDependencies) && !R.isNil(packageDependencies)
      ? Object.keys(packageDependencies).map(key => `${key}@${packageDependencies[key]}`)
      : null;
  obj.files =
    !R.isEmpty(files) && !R.isNil(files)
      ? files.filter(file => !file.test).map(file => normalize(file.relative))
      : null;
  obj.specs =
    !R.isEmpty(files) && !R.isNil(files) && R.find(R.propEq('test', true))(files)
      ? files.filter(file => file.test).map(file => normalize(file.relative))
      : null;
  obj.deprecated = deprecated ? 'True' : null;
  obj.docs = docs;
  return obj;
}

function generateDependenciesTable(component, showRemoteVersion, compareD) {
  if (!component.dependencies || !component.dependencies.length) return '';
  const dependencyHeader = [];
  if (showRemoteVersion) {
    dependencyHeader.push({ value: 'Dependency ID', width: 80, headerColor: 'cyan' });
    dependencyHeader.push({ value: 'Current Version', width: 20, headerColor: 'cyan' });
    dependencyHeader.push({ value: 'Local Version', width: 20, headerColor: 'cyan' });
    dependencyHeader.push({ value: 'Remote Version', width: 20, headerColor: 'cyan' });
  } else {
    dependencyHeader.push({ value: 'Dependencies', width: 80, headerColor: 'cyan' });
  }
  const dependencyRows = [];
  component.dependencies.forEach((dependency) => {
    const dependencyId = showRemoteVersion ? dependency.id.toStringWithoutVersion() : dependency.id.toString();
    const row = [dependencyId];
    if (showRemoteVersion) {
      const dependencyVersion = parseInt(dependency.currentVersion);
      const localVersion = parseInt(dependency.localVersion);
      const remoteVersion = dependency.remoteVersion ? parseInt(dependency.remoteVersion) : null;
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

  const dependenciesTable = new Table(dependencyHeader, dependencyRows);
  return dependenciesTable.render();
}

function paintWithoutCompare(component: ConsumerComponent, showRemoteVersion: boolean) {
  const printableComponent = convertObjectToPrintable(component, false, !showRemoteVersion);
  const rows = fields
    .map((field) => {
      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      const arr = [];
      if (!printableComponent[field]) return null;
      if (field === 'id') {
        header.push({ value: printableComponent[field], width: 70, headerColor: 'white' });
        return null;
      }
      arr.push(c.cyan(title));
      if (!printableComponent[field]) return null;
      printableComponent[field] ? arr.push(printableComponent[field]) : null;
      return arr;
    })
    .filter(x => x);

  const componentTable = new Table(header, rows, opts);
  const componentTableStr = componentTable.render();
  const dependenciesTableStr = showRemoteVersion ? generateDependenciesTable(component, showRemoteVersion) : '';

  return componentTableStr + dependenciesTableStr + paintDocumentation(component.docs);
}

function paintWithCompare(
  originalComponent: ConsumerComponent,
  componentToCompareTo: ConsumerComponent,
  showRemoteVersion: boolean
) {
  const printableOriginalComponent = convertObjectToPrintable(originalComponent, true, true);
  const printableComponentToCompare = convertObjectToPrintable(componentToCompareTo, false, true);

  const componentsDiffs = diff.custom(
    {
      equal: comparator
    },
    printableOriginalComponent,
    printableComponentToCompare
  );

  const rows = fields
    .map((field) => {
      if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      if (field === 'id') {
        header.push({ value: printableComponentToCompare[field], width: 70, headerColor: 'white' });
        header.push({ value: printableOriginalComponent[field], width: 70, headerColor: 'white' });
        return null;
      }
      const arr = field in componentsDiffs && field !== 'id' ? [c.red(title)] : [c.cyan(title)];
      printableComponentToCompare[field] instanceof Array
        ? arr.push(printableComponentToCompare[field].join(','))
        : arr.push(printableComponentToCompare[field]);
      printableOriginalComponent[field] instanceof Array
        ? arr.push(printableOriginalComponent[field].join(','))
        : arr.push(printableOriginalComponent[field]);
      return arr;
    })
    .filter(x => x);

  const componentTable = new Table(header, rows);
  const componentTableStr = componentTable.render();
  const dependenciesTableStr = !componentToCompareTo
    ? generateDependenciesTable(originalComponent, showRemoteVersion)
    : '';
  return componentTableStr + dependenciesTableStr;
}

export default (component: ConsumerComponent, componentModel: ConsumerComponent, showRemoteVersion: boolean) => {
  return componentModel
    ? paintWithCompare(component, componentModel, showRemoteVersion)
    : paintWithoutCompare(component, showRemoteVersion);
};
