/**
 * A file to define the list of migration needs to be run for each version
 */
import * as bitMapMigrations from './bit-map';

export default {
  '0.11.1': {
    bitmap: [bitMapMigrations.changeVersionToSemVerDeclartaion],
  },
};
