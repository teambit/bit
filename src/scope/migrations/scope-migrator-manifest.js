/** @flow */
/**
 * A file to define the list of migration needs to be run for each version
 */
import * as componentMigrations from './component';
import * as versionMigrations from './component-version';

export default {
  '0.11.0-test.3': {
    Component: [componentMigrations.changeVersionToSemVerDeclartaion],
    Version: [versionMigrations.addBindingPrefixDeclartaion, versionMigrations.changeVersionToSemVerDeclartaion]
  }
};
