import { expect } from 'chai';
import Version from '../../../src/scope/models/version';

const versionFixture = require('./fixtures/version-model-object.json');
const versionWithDepsFixture = require('./fixtures/version-model-with-dependencies.json');

describe('Version', () => {
  describe('id()', () => {
    describe('simple version', () => {
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
    describe('version with dependencies', () => {
      let dependencies;
      before(() => {
        const version = new Version(versionWithDepsFixture);
        const idRaw = version.id();
        const idParsed = JSON.parse(idRaw);
        dependencies = idParsed.dependencies;
      });
      it('dependencies should be an array', () => {
        expect(dependencies)
          .to.be.an('array')
          .and.have.lengthOf(1);
      });
      it('dependencies should have properties id and relativePaths only', () => {
        expect(dependencies[0]).to.haveOwnProperty('id');
        expect(dependencies[0]).to.haveOwnProperty('relativePaths');
        expect(dependencies[0]).to.not.haveOwnProperty('nonExistProperty');
        expect(Object.keys(dependencies[0])).to.have.lengthOf(2);
      });
      it('relativePaths should be an array', () => {
        expect(dependencies[0].relativePaths)
          .to.be.an('array')
          .and.have.lengthOf(1);
      });
      it('relativePaths should have properties sourceRelativePath and destinationRelativePath only', () => {
        expect(dependencies[0].relativePaths[0]).to.haveOwnProperty('sourceRelativePath');
        expect(dependencies[0].relativePaths[0]).to.haveOwnProperty('destinationRelativePath');
        expect(dependencies[0].relativePaths[0]).to.not.haveOwnProperty('nonExistProperty');
        expect(Object.keys(dependencies[0].relativePaths[0])).to.have.lengthOf(2);
      });
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
    it('should have a correct hash string', () => {
      expect(hash.toString()).to.equal(versionFixtureHash);
    });
    it('should have a the same hash string also when loading the version from contents', () => {
      const versionFromContent = Version.parse(JSON.stringify(versionFixture));
      expect(versionFromContent.hash().toString()).to.equal(versionFixtureHash);
    });
  });
});
