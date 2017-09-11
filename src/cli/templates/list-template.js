// @flow
import c from 'chalk';
import Table from 'cli-table2';
import ConsumerComponent from '../../consumer/component/consumer-component';

export default (components: ConsumerComponent[]) => {
  const table = new Table({
    head: [c.cyan('ID'), c.cyan('Version')],
    colWidths: [46, 9],
    wordWrap: true
  });

  function tablizeComponent(component) {
    return [`${component.box}/${component.name}${c.red(component.deleted ? '[Deleted]' : '')}`, component.version]; // Add date, author
  }

  table.push(...components.map(tablizeComponent));
  return table.toString();
};
