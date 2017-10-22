// @flow
import c from 'chalk';
import Table from 'tty-table';
import ConsumerComponent from '../../consumer/component/consumer-component';

export default (components: ConsumerComponent[]) => {
  const header = [
    { value: 'Id', width: 46, headerColor: 'cyan', headerAlign: 'left' },
    { value: 'Version', width: 9, headerColor: 'cyan', headerAlign: 'left' }
  ];
  const opts = {
    align: 'left'
  };

  function tablizeComponent(component) {
    return [
      `${component.box}/${component.name}${c.red(component.deprecated ? ' [Deprecated]' : '')}`,
      component.version
    ]; // Add date, author
  }

  const rows = components.map(tablizeComponent);
  const table = new Table(header, rows, opts);

  return table.render();
};
