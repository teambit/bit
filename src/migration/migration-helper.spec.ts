import { expect } from 'chai';

import logger from '../logger/logger';
import getMigrationVersions from '../migration/migration-helper';

describe('migration helper', () => {
  let migrationVersions;
  let versionsNumbers;
  // @ts-ignore
  logger.debug = () => {};
  before(() => {
    const storeVersion = '0.0.3';
    const bitVersion = '0.0.6';
    const migratonManifest = {
      '0.0.5': {
        Version: [],
      },
      '0.0.3': {
        Version: [],
      },
      '0.0.4': {
        Version: [],
      },
      '0.0.6': {
        Version: [],
      },
      '0.0.7': {
        Version: [],
      },
    };
    migrationVersions = getMigrationVersions(bitVersion, storeVersion, migratonManifest);
    versionsNumbers = migrationVersions.map((migrationVersion) => Object.keys(migrationVersion)[0]);
  });
  it('should sort the version in ascending order', () => {
    expect(versionsNumbers).include.ordered.members(['0.0.4', '0.0.5', '0.0.6']);
  });
  it('should filter versions below the store version', () => {
    expect(versionsNumbers).to.not.include('0.0.3');
  });
  it('should filter versions above the current version', () => {
    expect(versionsNumbers).to.not.include('0.0.7');
  });
});
