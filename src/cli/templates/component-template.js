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
function convertObjectToPrintable(component) {
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
  obj.id = version === 'latest' ? `${box}/${name}@${version} \n[file system]` : `${box}/${name}@${version}`;
  obj.compiler = compilerId ? compilerId.toString() : null;
  obj.language = lang || null;
  obj.tester = testerId ? testerId.toString() : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies =
    !R.isEmpty(dependencies) && !R.isNil(dependencies)
      ? dependencies.map(dependency => dependency.id.toString())
      : null;
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

function paintWithoutCompare(component: ConsumerComponent) {
  const printableComponent = convertObjectToPrintable(component);
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

  const table = new Table(header, [], opts);
  table.push(...rows);
  return table.render() + paintDocumentation(component.docs);
}

function paintWithCompare(originalComponent: ConsumerComponent, componentToCompareTo: ConsumerComponent) {
  const printableOriginalComponent = convertObjectToPrintable(originalComponent);
  const printableComponentToCompare = convertObjectToPrintable(componentToCompareTo);

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

  const table = new Table(header, []);
  table.push(...rows);
  return table.render();
}
export default (component: ConsumerComponent, moduleComponent: ConsumerComponent) => {
  return moduleComponent ? paintWithCompare(component, moduleComponent) : paintWithoutCompare(component);
};
