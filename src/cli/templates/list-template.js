// @flow
import c from 'chalk';
import R from 'ramda';
import semver from 'semver';
import Table from 'tty-table';
import ConsumerComponent from '../../consumer/component/consumer-component';
import { BitId } from '../../bit-id';

export default (components: ConsumerComponent[], json: boolean, showRemoteVersion?: boolean = false) => {
  const header = [
    { value: 'Id', width: 70, headerColor: 'cyan', headerAlign: 'left' },
    { value: showRemoteVersion ? 'Local Version' : 'Version', width: 9, headerColor: 'cyan', headerAlign: 'left' }
  ];
  if (showRemoteVersion) {
    header.push({ value: 'Current Version', width: 9, headerColor: 'cyan', headerAlign: 'left' });
    header.push({ value: 'Remote Version', width: 9, headerColor: 'cyan', headerAlign: 'left' });
  }
  const opts = {
    align: 'left'
  };

  function tablizeComponent(component: ConsumerComponent) {
    const id = component.id.toStringWithoutVersion();
    const data = { id: c.white(`${id}${component.deprecated ? ' [Deprecated]' : ''}`) }; // Add date, author
    let version = component.version;
    if (!json && showRemoteVersion) {
      const color = component.latest && semver.gt(component.latest, component.version) ? 'red' : null;
      version = color ? c[color](version) : version;
    }
    const getCurrentlyUsedVersion = () => {
      if (!component.currentlyUsedVersion) return 'N/A';
      const bitId = BitId.parse(component.currentlyUsedVersion);
      if (!bitId.hasVersion()) return 'N/A';
      return bitId.version;
    };
    data.localVersion = version;
    if (showRemoteVersion) {
      data.currentVersion = getCurrentlyUsedVersion();
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
