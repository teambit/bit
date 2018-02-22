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
  'devDependencies',
  'packages',
  'devPackages',
  'peerDependencies',
  'files',
  'specs',
  'deprecated'
];

const header = [{ value: 'ID', width: 20, headerColor: 'cyan', headerAlign: 'left', align: 'left' }];
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
    version,
    docs
  } = component;
  obj.id = isFromFs ? `${box}/${name}@${version} [file system]` : `${box}/${name}@${version}`;
  obj.compiler = compilerId ? compilerId.toString() : null;
  obj.language = lang || null;
  obj.tester = testerId ? testerId.toString() : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies = dependencies.toStringOfIds().concat(parsePackages(packageDependencies));
  obj.devDependencies = devDependencies.toStringOfIds().concat(parsePackages(devPackageDependencies));
  obj.peerDependencies = parsePackages(peerPackageDependencies);

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

function generateDependenciesTable(component: ConsumerComponent, showRemoteVersion) {
  if (!component.hasDependencies()) {
    return '';
  }
  const dependencyHeader = [];
  if (showRemoteVersion) {
    dependencyHeader.push({
      value: 'Dependency ID',
      width: 50,
      headerColor: 'cyan',
      headerAlign: 'left',
      align: 'left'
    });
    dependencyHeader.push({
      value: 'Current Version',
      width: 20,
      headerColor: 'cyan',
      headerAlign: 'left',
      align: 'left'
    });
    dependencyHeader.push({
      value: 'Local Version',
      width: 20,
      headerColor: 'cyan',
      headerAlign: 'left',
      align: 'left'
    });
    dependencyHeader.push({
      value: 'Remote Version',
      width: 20,
      headerColor: 'cyan',
      headerAlign: 'left',
      align: 'left'
    });
  } else {
    dependencyHeader.push({ value: 'Dependencies', width: 50, headerColor: 'cyan' });
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

  const dependenciesTable = new Table(dependencyHeader, allDependenciesRows);
  return dependenciesTable.render();
}

function paintWithoutCompare(component: ConsumerComponent, showRemoteVersion: boolean) {
  const printableComponent = convertObjectToPrintable(component, false);
  const rows = fields
    .map((field) => {
      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      const arr = [];
      if (!printableComponent[field]) return null;
      if (field === 'id') {
        header.push({
          value: printableComponent[field],
          width: 50,
          headerColor: 'white',
          headerAlign: 'left',
          align: 'left'
        });
        return null;
      }
      arr.push(c.cyan(title));
      if (!printableComponent[field]) return null;

      if (printableComponent[field]) {
        if (printableComponent[field] instanceof Array) {
          arr.push(printableComponent[field].join('\n'));
        } else arr.push(printableComponent[field]);
      }
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
      if (!printableOriginalComponent[field] && !printableComponentToCompare[field]) return null;
      const title = `${field[0].toUpperCase()}${field.substr(1)}`.replace(/([A-Z])/g, ' $1').trim();
      if (field === 'id') {
        header.push({
          value: printableComponentToCompare[field],
          width: 50,
          headerColor: 'white',
          headerAlign: 'left',
          align: 'left'
        });
        header.push({
          value: printableOriginalComponent[field],
          width: 50,
          headerColor: 'white',
          headerAlign: 'left',
          align: 'left'
        });
        return null;
      }
      const arr = field in componentsDiffs && field !== 'id' ? [c.red(title)] : [c.cyan(title)];
      printableComponentToCompare[field] instanceof Array
        ? arr.push(printableComponentToCompare[field].join('\n'))
        : arr.push(printableComponentToCompare[field]);
      printableOriginalComponent[field] instanceof Array
        ? arr.push(printableOriginalComponent[field].join('\n'))
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
