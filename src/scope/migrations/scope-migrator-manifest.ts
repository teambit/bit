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
      versionMigrations.changeVersionToSemVerDeclartaion,
    ],
  },
  '0.11.1': {
    Version: [versionMigrations.changeImportSpecifiersToArray, versionMigrations.ensureMainFileDeclartaion],
  },
  '0.12.0': {
    Component: [componentMigrations.updateBindingPrefixToNewDefault],
    Version: [versionMigrations.updateBindingPrefixToNewDefault],
  },
  '0.12.1': {
    Version: [versionMigrations.removeLatestFromCompiler],
  },
};
