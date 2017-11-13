/** @flow */
/**
 * A file to define the list of migration needs to be run for each version
 */
import * as componentMigrations from './component';
import * as versionMigrations from './component-version';

export default {
  '0.11.0': {
    Component: [componentMigrations.changeVersionToSemVerDeclartaion],
    Version: [
      versionMigrations.implSpecsToFilesDeclartaion,
      versionMigrations.specsResultstoArrayDeclartaion,
      versionMigrations.addBindingPrefixDeclartaion,
      versionMigrations.changeVersionToSemVerDeclartaion
    ]
  },
  '0.11.1-dev.1': {
    Version: [versionMigrations.changeImportSpecifiersToArray]
  }
};
