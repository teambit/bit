import { expect } from 'chai';
import Version from '../../../src/scope/models/version';

const versionFixture = require('./fixtures/version-model-object.json');

describe.skip('Version', () => {
  describe('id()', () => {
    let version;
    let idRaw;
    let idParsed;
    before(() => {
      version = new Version(versionFixture);
      idRaw = version.id();
      idParsed = JSON.parse(idRaw);
    });
    it('should have mainFile property', () => {
      expect(idParsed).to.haveOwnProperty('mainFile');
    });
    it('should have files property', () => {
      expect(idParsed).to.haveOwnProperty('files');
    });
    it('should have compiler property', () => {
      expect(idParsed).to.haveOwnProperty('compiler');
    });
    it('should have tester property', () => {
      expect(idParsed).to.haveOwnProperty('tester');
    });
    it('should have log property', () => {
      expect(idParsed).to.haveOwnProperty('log');
    });
    it('should have dependencies property', () => {
      expect(idParsed).to.haveOwnProperty('dependencies');
    });
    it('should have packageDependencies property', () => {
      expect(idParsed).to.haveOwnProperty('packageDependencies');
    });
    it('should have bindingPrefix property', () => {
      expect(idParsed).to.haveOwnProperty('bindingPrefix');
    });
    it('should not have dists property', () => {
      expect(idParsed).to.not.haveOwnProperty('dists');
    });
    it('should not have ci property', () => {
      expect(idParsed).to.not.haveOwnProperty('ci');
    });
    it('should not have specsResults property', () => {
      expect(idParsed).to.not.haveOwnProperty('specsResults');
    });
    it('should not have docs property', () => {
      expect(idParsed).to.not.haveOwnProperty('docs');
    });
    it('should not have devDependencies property', () => {
      expect(idParsed).to.not.haveOwnProperty('devDependencies');
    });
    it('should not have flattenedDependencies property', () => {
      expect(idParsed).to.not.haveOwnProperty('flattenedDependencies');
    });
    it('should not have flattenedDevDependencies property', () => {
      expect(idParsed).to.not.haveOwnProperty('flattenedDevDependencies');
    });
    it('should not have devPackageDependencies property', () => {
      expect(idParsed).to.not.haveOwnProperty('devPackageDependencies');
    });
    it('should not have peerPackageDependencies property', () => {
      expect(idParsed).to.not.haveOwnProperty('peerPackageDependencies');
    });
  });
  describe('hash()', () => {
    let version;
    let hash;
    const versionFixtureHash = '693679c1c397ca3c42f6f3486ce1ed042787886a';
    before(() => {
      version = new Version(versionFixture);
      hash = version.hash();
    });
    it.skip('should have a correct hash string', () => {
      expect(hash.toString()).to.equal(versionFixtureHash);
    });
    it('should have a the same hash string also when loading the version from contents', () => {
      const versionFromContent = Version.parse(JSON.stringify(versionFixture));
      expect(versionFromContent.hash().toString()).to.equal(versionFixtureHash);
    });
  });
});
