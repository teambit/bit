import R from 'ramda';
import path from 'path';
import { expect } from 'chai';
import removeDuplicatesFiles from '../../../../src/scope/migrations/component-version/remove-duplicates-files';
import versionFixture from '../../models/fixtures/version-model-object.json';
import logger from '../../../../src/logger/logger';

const getVersionObject = () => {
  return R.clone(versionFixture);
};

const generateFileObject = (relativePath) => {
  return {
    file: '4837fafa092035a1c4b8b462473e90f8b0bf9b0a',
    relativePath,
    name: path.basename(relativePath)
  };
};

describe('removeDuplicateFiles', () => {
  before(() => {
    logger.debug = () => {};
    logger.warn = () => {};
    logger.error = () => {};
  });
  describe('two duplicated files with different letter case when one of them equals to the mainFile', () => {
    let file1;
    let file2;
    let versionObject;
    before(() => {
      file1 = generateFileObject('bar/foo.js');
      file2 = generateFileObject('bar/Foo.js');
      versionObject = getVersionObject();
      versionObject.mainFile = 'bar/foo.js';
    });
    it('should remove the file that is not equal to the mainFile', () => {
      versionObject.files = [file1, file2];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(1);
      expect(versionAfterMigration.files[0].relativePath).to.equal('bar/foo.js');
    });
    it('should remove the file that is not equal to the mainFile even if it is located first', () => {
      versionObject.files = [file2, file1];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(1);
      expect(versionAfterMigration.files[0].relativePath).to.equal('bar/foo.js');
    });
  });
  describe('two duplicated files with the same letter case when one of the file is a test file', () => {
    let file1;
    let file2;
    let versionObject;
    before(() => {
      file1 = generateFileObject('bar/foo.js');
      file2 = generateFileObject('bar/foo.js');
      file2.test = true;
      versionObject = getVersionObject();
      versionObject.mainFile = 'bar/foo.js';
    });
    it('should remove the file that is not marked as test', () => {
      versionObject.files = [file1, file2];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(1);
      expect(versionAfterMigration.files[0].test).to.be.true;
    });
    it('should remove the file that is not marked as test even if it is located first', () => {
      versionObject.files = [file2, file1];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(1);
      expect(versionAfterMigration.files[0].test).to.be.true;
    });
  });
  describe('three duplicated files with the same letter case, none is a test file', () => {
    let file1;
    let file2;
    let file3;
    let versionObject;
    before(() => {
      file1 = generateFileObject('bar/foo.js');
      file2 = generateFileObject('bar/foo.js');
      file3 = generateFileObject('bar/foo.js');
      versionObject = getVersionObject();
      versionObject.mainFile = 'bar/foo.js';
    });
    it('should pick the first one and remove the other two', () => {
      versionObject.files = [file1, file2, file3];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(1);
      expect(versionAfterMigration.files[0].relativePath).to.equal('bar/foo.js');
    });
  });
  describe('two duplicated files with different hashes', () => {
    let file1;
    let file2;
    let versionObject;
    before(() => {
      file1 = generateFileObject('bar/foo.js');
      file2 = generateFileObject('bar/foo.js');
      file2.file = '5837fafa092035a1c4b8b462473e90f8b0bf9b0b';
      versionObject = getVersionObject();
      versionObject.mainFile = 'bar/foo.js';
    });
    it('should not remove any file as they might be two different files created on a case sensitive system', () => {
      versionObject.files = [file1, file2];
      const versionAfterMigration = removeDuplicatesFiles.migrate(versionObject);
      expect(versionAfterMigration.files).to.have.lengthOf(2);
    });
  });
});
