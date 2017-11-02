/** @flow */
/**
 * A file to define the list of migration needs to be run for each version
 */
import * as componentMigrations from './component';

export default {
  '0.10.10': {
    Component: [componentMigrations.changeVersionToSemVerDeclartaion]
  },
  '0.10.9': {
    Component: [componentMigrations.changeVersionToSemVerDeclartaion]
  },
  '0.10.8': 123,
  '0.10.7': 123
};
