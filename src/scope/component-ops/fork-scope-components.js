// @flow
import R from 'ramda';
import BitIds from '../../bit-id/bit-ids';
import { Scope } from '..';
import ScopeComponentsImporter from './scope-components-importer';
import BitId from '../../bit-id/bit-id';
import { exportMany } from './export-scope-components';

export default (async function forkComponents({
  scope,
  ids,
  remote,
  dependencies
}: {
  scope: Scope,
  ids: BitIds,
  remote: string,
  dependencies: boolean
}) {
  if (dependencies) {
    const dependenciesIds = await getDependenciesImportIfNeeded();
    ids.push(...dependenciesIds);
  }
  // $FlowFixMe
  return exportMany(scope, BitIds.uniqFromArray(ids), remote, undefined, true);

  async function getDependenciesImportIfNeeded(): Promise<BitId[]> {
    const scopeComponentImporter = new ScopeComponentsImporter(scope);
    const versionsDependencies = await scopeComponentImporter.importManyWithAllVersions(ids, true, true);
    const allDependencies = R.flatten(
      versionsDependencies.map(versionDependencies => versionDependencies.allDependencies)
    );
    return allDependencies.map(componentVersion => componentVersion.component.toBitId());
  }
});
