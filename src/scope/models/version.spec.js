import R from 'ramda';
import { expect } from 'chai';
import Version from '../../../src/scope/models/version';
import versionFixture from '../../../fixtures/version-model-object.json';
import versionWithDepsFixture from '../../../fixtures/version-model-extended.json';
import { SSH_PROTOCOL_PREFIX } from '../../constants';

const getVersionWithDepsFixture = () => {
  return Version.parse(JSON.stringify(R.clone(versionWithDepsFixture)));
};

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
      it('should not have compilerDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('compilerDependencies');
      });
      it('should not have testerDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('testerDependencies');
      });
      it('should not have flattenedDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('flattenedDependencies');
      });
      it('should not have flattenedDevDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('flattenedDevDependencies');
      });
      it('should not have flattenedCompilerDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('flattenedCompilerDependencies');
      });
      it('should not have flattenedTesterDependencies property', () => {
        expect(idParsed).to.not.haveOwnProperty('flattenedTesterDependencies');
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
        const version = getVersionWithDepsFixture();
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
  describe('validate()', () => {
    let version;
    let validateFunc;
    beforeEach(() => {
      version = getVersionWithDepsFixture();
      validateFunc = () => version.validate();
    });
    it('should not throw when it has a valid version', () => {
      expect(validateFunc).to.not.throw();
    });
    it('should throw when mainFile is empty', () => {
      const errMsg = 'mainFile is missing';
      version.mainFile = null;
      expect(validateFunc).to.throw(errMsg);
      version.mainFile = '';
      expect(validateFunc).to.throw(errMsg);
      version.mainFile = undefined;
      expect(validateFunc).to.throw(errMsg);
    });
    it('should throw when mainFile path is absolute', () => {
      version.mainFile = '/tmp/main.js';
      expect(validateFunc).to.throw(`mainFile ${version.mainFile} is invalid`);
    });
    it('should throw when mainFile path is Windows format', () => {
      version.mainFile = 'a\\tmp.js';
      expect(validateFunc).to.throw(`mainFile ${version.mainFile} is invalid`);
    });
    it('should throw when the files are missing', () => {
      version.files = undefined;
      expect(validateFunc).to.throw('files are missing');
      version.files = null;
      expect(validateFunc).to.throw('files are missing');
      version.files = [];
      expect(validateFunc).to.throw('files are missing');
    });
    it('should throw when the file has no hash', () => {
      version.files[0].file = '';
      expect(validateFunc).to.throw('missing the hash');
    });
    it('should throw when the file has no name', () => {
      version.files[0].name = '';
      expect(validateFunc).to.throw('missing the name');
    });
    it('should throw when the file.name is not a string', () => {
      version.files[0].name = true;
      expect(validateFunc).to.throw('to be string, got boolean');
    });
    it('should throw when the file hash is not a string', () => {
      version.files[0].file.hash = [];
      expect(validateFunc).to.throw('to be string, got object');
    });
    it('should throw when the main file is not in the file lists', () => {
      version.files[0].relativePath = 'anotherFile.js';
      expect(validateFunc).to.throw('unable to find the mainFile');
    });
    it('should throw when the two files have the same name but different letter cases', () => {
      version.files[1] = R.clone(version.files[0]);
      version.files[1].relativePath = 'bar/Foo.ts';
      expect(validateFunc).to.throw('files are duplicated bar/foo.ts, bar/Foo.ts');
    });
    it('compiler should have name attribute', () => {
      version.compiler = {};
      expect(validateFunc).to.throw('missing the name attribute');
    });
    it('compiler.name should be a string', () => {
      version.compiler.name = true;
      expect(validateFunc).to.throw('to be string, got boolean');
    });
    it('compiler.name should be a valid bit id with version', () => {
      version.compiler.name = 'scope/pref/aaa@latest';
      expect(validateFunc).to.throw('does not have a version');
    });
    it('compiler.files should have name attribute', () => {
      version.compiler.files[0] = 'string';
      expect(validateFunc).to.throw('missing the name attribute');
    });
    it('if a compiler is string, it should be a valid bit-id', () => {
      version.compiler = 'this/is\\invalid?!/bit/id';
      expect(validateFunc).to.throw('the environment-id has an invalid Bit id');
    });
    it('if a compiler is string, it should have scope', () => {
      version.compiler = 'name@0.0.1';
      expect(validateFunc).to.throw('the environment-id has an invalid Bit id');
    });
    // it('if a compiler is string, it should have version', () => {
    //   version.compiler = 'scope/box/name';
    //   expect(validateFunc).to.throw('does not have a version');
    // });
    it('should throw for an invalid package version', () => {
      version.packageDependencies = { lodash: 34 };
      expect(validateFunc).to.throw('expected version of "lodash" to be string, got number');
    });
    it('should not throw for a package version which is a git url', () => {
      version.packageDependencies = { userLib: `git+${SSH_PROTOCOL_PREFIX}git@git.bit.io` };
      expect(validateFunc).to.not.throw();
    });
    it('should throw for invalid packageDependencies type', () => {
      version.packageDependencies = 'invalid packages';
      expect(validateFunc).to.throw('to be object, got string');
    });
    it('should throw for invalid devPackageDependencies type', () => {
      version.devPackageDependencies = [1, 2, 3];
      expect(validateFunc).to.throw('to be object, got array');
    });
    it('should throw for invalid peerPackageDependencies type', () => {
      version.peerPackageDependencies = true;
      expect(validateFunc).to.throw('to be object, got boolean');
    });
    it('should throw for invalid dist object', () => {
      version.dists = 'invalid dists';
      expect(validateFunc).to.throw('to be array, got string');
    });
    it('should throw for invalid dist.relativePath', () => {
      version.dists[0].relativePath = 'invalid*path';
      expect(validateFunc).to.throw(`dist-file ${version.dists[0].relativePath} is invalid`);
    });
    it('should throw for an empty dist.relativePath', () => {
      version.dists[0].relativePath = '';
      expect(validateFunc).to.throw(`dist-file ${version.dists[0].relativePath} is invalid`);
    });
    it('should throw for an invalid dist.name', () => {
      version.dists[0].name = 4;
      expect(validateFunc).to.throw('to be string, got number');
    });
    it('should throw when the file hash is not a string', () => {
      version.dists[0].file.hash = {};
      expect(validateFunc).to.throw('to be string, got object');
    });
    it('should throw when dependencies are invalid', () => {
      version.dependencies = {};
      expect(validateFunc).to.throw('dependencies must be an instance of Dependencies, got object');
    });
    it('should throw when devDependencies are invalid', () => {
      version.devDependencies = {};
      expect(validateFunc).to.throw('devDependencies must be an instance of Dependencies, got object');
    });
    it('should throw when compilerDependencies are invalid', () => {
      version.compilerDependencies = {};
      expect(validateFunc).to.throw('compilerDependencies must be an instance of Dependencies, got object');
    });
    it('should throw when testerDependencies are invalid', () => {
      version.testerDependencies = {};
      expect(validateFunc).to.throw('testerDependencies must be an instance of Dependencies, got object');
    });
    it('should throw when there are dependencies and the flattenDependencies are empty', () => {
      version.flattenedDependencies = [];
      expect(validateFunc).to.throw('it has dependencies but its flattenedDependencies is empty');
    });
    it('should throw when a flattenDependency is invalid', () => {
      version.flattenedDependencies = [1234];
      expect(validateFunc).to.throw('expected to be BitId, got number');
    });
    it('should throw when a flattenDependency does not have a version', () => {
      version.flattenedDependencies[0] = version.flattenedDependencies[0].changeVersion(null);
      expect(validateFunc).to.throw('does not have a version');
    });
    it('should throw when the log is empty', () => {
      version.log = undefined;
      expect(validateFunc).to.throw('log object is missing');
    });
    it('should throw when the log has an invalid type', () => {
      version.log = [];
      expect(validateFunc).to.throw('to be object, got array');
    });
    it('should throw when the bindingPrefix has an invalid type', () => {
      version.bindingPrefix = {};
      expect(validateFunc).to.throw('to be string, got object');
    });
  });
});
