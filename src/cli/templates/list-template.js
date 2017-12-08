// @flow
import c from 'chalk';
import R from 'ramda';
import semver from 'semver';
import Table from 'tty-table';
import ConsumerComponent from '../../consumer/component/consumer-component';

export default (components: ConsumerComponent[], json: boolean, showRemoteVersion?: boolean = false) => {
  const header = [
    { value: 'Id', width: 70, headerColor: 'cyan', headerAlign: 'left' },
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
    const data = { id: c.red(`${id}${component.deprecated ? ' [Deprecated]' : ''}`) }; // Add date, author
    let version = component.version;
    if (!json && showRemoteVersion) {
      const color = component.latest && semver.gt(component.latest, component.version) ? 'red' : null;
      version = color ? c[color](version) : version;
    }
    data.localVersion = version;
    if (showRemoteVersion) {
      let remoteVersion = component.latest || 'N/A';
      const color = component.latest && semver.gt(component.version, component.latest) ? 'red' : null;
      remoteVersion = color ? c[color](remoteVersion) : remoteVersion;
      data.remoteVersion = remoteVersion;
    }
    return data;
  }

  const rows = components.map(tablizeComponent);
  if (json) return JSON.stringify(rows);

  const table = new Table(header, rows.map(row => R.values(row)), opts);
  return table.render();
};
