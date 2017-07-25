// @flow
import R from 'ramda';
import c from 'chalk';
import Table from 'cli-table2';
import ConsumerComponent from '../../consumer/component/consumer-component';
import paintDocumentation from './docs-template';

export default (component: ConsumerComponent) => {
  const table = new Table({
    colWidths: [20, 50],
    wordWrap: true,
  });

  const { name, box, lang, compilerId, testerId, dependencies, packageDependencies, docs, files } = component;

  const rows = [
    { [c.cyan('ID')]: `${box}/${name}` },
    compilerId ? { [c.cyan('Compiler')]: compilerId.toString() }: null,
    lang ? { [c.cyan('Language')]: lang }: null,
    testerId ? { [c.cyan('Tester')]: testerId.toString() }: null,
    !R.isEmpty(dependencies) ? { [c.cyan('Dependencies')]: dependencies.map(dependency => dependency.id.toString()).join(',\n') } : null,
    !R.isEmpty(packageDependencies) ? { [c.cyan('Packages')]: Object.keys(packageDependencies).join(',\n') } : null,
    !R.isEmpty(files) ? { [c.cyan('Files')]: files.map(file => file.relative).join(',\n') } : null,
  ].filter(x => x);

  table.push(...rows);

  return table.toString() + paintDocumentation(docs);
};
