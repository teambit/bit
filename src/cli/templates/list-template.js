// @flow
import c from 'chalk';
import R from 'ramda';
import Table from 'tty-table';
import ConsumerComponent from '../../consumer/component/consumer-component';

export default (components: ConsumerComponent[], json: boolean, showRemoteVersion?: boolean = false) => {
  const header = [
    { value: 'Id', width: 60, headerColor: 'cyan', headerAlign: 'left' },
    { value: showRemoteVersion ? 'Local Version' : 'Version', width: 9, headerColor: 'cyan', headerAlign: 'left' }
  ];
  if (showRemoteVersion) {
    header.push({ value: 'Remote Version', width: 9, headerColor: 'cyan', headerAlign: 'left' });
  }
  const opts = {
    align: 'left'
  };

  function tablizeComponent(component: ConsumerComponent) {
    const id = component.id.toStringWithoutVersion();
    const data = { id: `${id}${c.red(component.deprecated ? ' [Deprecated]' : '')}` }; // Add date, author
    let version = component.version;
    if (!json && showRemoteVersion) {
      const color = component.latest && component.latest > component.version ? 'red' : 'green';
      version = c[color](version);
    }
    data.localVersion = version;
    if (showRemoteVersion) {
      data.remoteVersion = component.latest ? parseInt(component.latest) : 'N/A';
    }
    return data;
  }

  const rows = components.map(tablizeComponent);
  if (json) return JSON.stringify(rows);

  const table = new Table(header, rows.map(row => R.values(row)), opts);
  return table.render();
};
