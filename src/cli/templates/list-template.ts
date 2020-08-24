import c from 'chalk';
import R from 'ramda';
import semver from 'semver';
import Table from 'tty-table';

import { ListScopeResult } from '../../consumer/component/components-list';

type Row = { id: string; localVersion: string; currentVersion: string; remoteVersion?: string };

export default (listScopeResults: ListScopeResult[], json: boolean, showRemoteVersion: boolean) => {
  const header = [
    { value: 'component ID', width: 70, headerColor: 'cyan', headerAlign: 'left' },
    {
      value: showRemoteVersion ? 'local version' : 'local version',
      width: 9,
      headerColor: 'cyan',
      headerAlign: 'left',
    },
    { value: 'used version', width: 9, headerColor: 'cyan', headerAlign: 'left' },
  ];
  if (showRemoteVersion) {
    header.push({ value: 'remote version', width: 9, headerColor: 'cyan', headerAlign: 'left' });
  }
  const opts = {
    align: 'left',
  };

  function tabulateComponent(listScopeResult: ListScopeResult): Row {
    const id = listScopeResult.id.toStringWithoutVersion();
    let version = listScopeResult.id.version;
    if (!json && showRemoteVersion) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const color = listScopeResult.remoteVersion && semver.gt(listScopeResult.remoteVersion, version!) ? 'red' : null;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      version = color ? c[color](version) : version;
    }
    const data: Row = {
      id: c.white(`${id}${listScopeResult.deprecated ? ' [Deprecated]' : ''}`),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      localVersion: version,
      currentVersion: listScopeResult.currentlyUsedVersion || 'N/A',
    };

    if (showRemoteVersion) {
      let remoteVersion = listScopeResult.remoteVersion || 'N/A';
      const color =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        listScopeResult.remoteVersion && semver.gt(listScopeResult.id.version!, listScopeResult.remoteVersion)
          ? 'red'
          : null;
      remoteVersion = color ? c[color](remoteVersion) : remoteVersion;
      data.remoteVersion = remoteVersion;
    }
    return data;
  }

  function toJsonComponent(listScopeResult: ListScopeResult): Record<string, any> {
    const id = listScopeResult.id.toStringWithoutVersion();
    const version = listScopeResult.id.version;
    const data = {
      id,
      localVersion: version,
      deprecated: listScopeResult.deprecated,
      currentVersion: listScopeResult.currentlyUsedVersion || 'N/A',
      remoteVersion: listScopeResult.remoteVersion || 'N/A',
    };
    return data;
  }

  if (json) {
    const jsonResults = listScopeResults.map(toJsonComponent);
    return JSON.stringify(jsonResults, null, 2);
  }
  const rows = listScopeResults.map(tabulateComponent);

  const table = new Table(
    header,
    rows.map((row) => R.values(row)),
    opts
  );
  return table.render();
};
