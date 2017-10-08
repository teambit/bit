// @flow
import R from 'ramda';
import c from 'chalk';
import diff from 'object-diff';
import Table from 'tty-table';
import normalize from 'normalize-path';
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

function convertObjectToPrintableObject(component) {
  const obj = {};
  const {
    name,
    box,
    lang,
    compilerId,
    testerId,
    dependencies,
    packageDependencies,
    docs,
    files,
    mainFile,
    deprecated,
    version
  } = component;
  obj.id = `${box}/${name}@${version}`;
  obj.compiler = compilerId ? compilerId.toString() : null;
  obj.language = lang || null;
  obj.tester = testerId ? testerId.toString() : null;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies =
    !R.isEmpty(dependencies) && !R.isNil(dependencies)
      ? dependencies.map(dependency => dependency.id.toString()).join(',\n')
      : null;
  obj.packages =
    !R.isEmpty(packageDependencies) && !R.isNil(packageDependencies)
      ? Object.keys(packageDependencies)
        .map(key => `${key}@${packageDependencies[key]}`)
        .join(', ')
      : null;
  obj.files =
    !R.isEmpty(files) && !R.isNil(files)
      ? files
        .filter(file => !file.test)
        .map(file => normalize(file.relative))
        .join(',\n')
      : null;
  obj.specs =
    !R.isEmpty(files) && !R.isNil(files)
      ? files
        .filter(file => file.test)
        .map(file => normalize(file.relative))
        .join(',\n')
      : null;
  obj.deprecated = deprecated ? 'True' : null;
  return obj;
}

function paintWithoutCompare(component: ConsumerComponent) {
  const opts = {
    borderStyle: 1,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 1,
    align: 'center',
    color: 'white'
  };

  const header = [];

  const printComponent = convertObjectToPrintableObject(component);
  const rows = fields
    .map((field) => {
      const title = `${field[0].toUpperCase()}${field.substr(1)}`;
      const arr = [c.cyan(title)];
      if (!printComponent[field]) return null;
      printComponent[field] ? arr.push(printComponent[field]) : null;
      return arr;
    })
    .filter(x => x);

  const table = new Table(header, [], opts);
  table.push(...rows);
  return table.render();
}

function paintWithCompare(component: ConsumerComponent, moduleComponent: ConsumerComponent) {
  const printComponent = convertObjectToPrintableObject(component);
  const printModule = convertObjectToPrintableObject(moduleComponent);

  const dff = diff(printComponent, printModule);
  delete dff.id;
  const rows = fields
    .map((field) => {
      const title = `${field[0].toUpperCase()}${field.substr(1)}`;
      if (!diff[field]) {
        const arr = [!dff[field] ? c.cyan(title) : c.red(title)];
      }
      const arr = [c.cyan(title)];
      if (!printComponent[field] && !printModule[field]) return null;
      printComponent[field] ? arr.push(printComponent[field]) : null;
      printModule[field] ? arr.push(printModule[field]) : null;
      return arr;
    })
    .filter(x => x);

  const table = new Table({ width: 50 }, []);
  table.push(...rows);
  return table.render();
}
export default (component: ConsumerComponent, moduleComponent: ConsumerComponent) => {
  return moduleComponent ? paintWithCompare(component, moduleComponent) : paintWithoutCompare(component);
};
