// covers also init, create, tag, import and export commands

import sinon from 'sinon';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

let logSpy;
const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit tag command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.reInitLocalScope();
    logSpy = sinon.spy(console, 'log');
  });
  describe('tag component with corrupted bitjson', () => {
    it('Should not commit component if bit.json is corrupted', () => {
      const fixture = "import foo from ./foo; module.exports = function foo2() { return 'got foo'; };";
      helper.createComponent('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js');
      const commit = () => helper.commitComponent('bar/foo2');
      helper.corruptBitJson();
      expect(commit).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
  });
  describe('tag one component', () => {
    it.skip('should throw error if the bit id does not exists', () => {});

    it.skip('should print warning if the a driver is not installed', () => {
      const fixture = "import foo from ./foo; module.exports = function foo2() { return 'got foo'; };";
      helper.createComponent('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js');
      // var myargs = logSpy.getCalls()[4].args
      // console.log("args", myargs);
      expect(
        logSpy.calledWith(
          'Warning: Bit is not be able calculate the dependencies tree. Please install bit-javascript driver and run tag again.\n'
        )
      ).to.be.true;
    });

    it.skip('should persist the model in the scope', () => {});

    it.skip('should run the onCommit hook', () => {});

    it.skip('should throw error if the build failed', () => {});

    it.skip('should throw error if the tests failed', () => {});

    describe.skip('tag imported component', () => {
      it('should index the component', () => {});

      it('should write the full id to bit map (include scope and version)', () => {});

      it('should create fork of the component', () => {
        // Should change the original version origin to nested if it's required by another imported deps
        // Should update all the deps in my own files to use the new version
        // Should move the old version in the fs to be nested
        // Should update the bit.map to point from the new version to the existing file
        // Should bind from other deps to the new fs location
      });
    });

    describe('tag added component', () => {
      let output;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
        output = helper.commitComponent('comp/comp');
      });

      it.skip('should index the component', () => {});

      it('should successfully tag if there is no special error', () => {
        // Validate output
        expect(output).to.have.string('1 components tagged');
        // Validate model
      });

      it.skip('Should throw error if there is tracked files dependencies which not tagged yet', () => {});

      describe('package dependencies calculation', () => {
        let packageDependencies;
        let depObject;
        let componentRootDir;
        before(() => {
          helper.reInitLocalScope();

          const fileFixture = 'import get from "lodash.get"';
          helper.createFile('src', 'file.js', fileFixture);
          helper.addComponentWithOptions('src/file.js', { i: 'comp/comp' });
          helper.addNpmPackage('lodash.get', '1.0.0');

          // Commit, export and import the component to make sure we have root folder defined in the bit.map
          helper.reInitRemoteScope();
          helper.addRemoteScope();
          helper.commitComponent('comp/comp');
          helper.exportComponent('comp/comp');
          helper.reInitLocalScope('comp/comp');
          helper.addRemoteScope();
          helper.importComponent('comp/comp');
          helper.addNpmPackage('lodash.get', '2.0.0');
          const bitMap = helper.readBitMap();
          componentRootDir = path.normalize(bitMap[`${helper.remoteScope}/comp/comp@1`].rootDir);
        });
        // beforeEach(() => {
        // });
        it('should take the package version from package.json in the component dir if exists', () => {
          const componentPackageJsonFixture = JSON.stringify({ dependencies: { 'lodash.get': '^1.0.1' } });
          helper.createFile(componentRootDir, 'package.json', componentPackageJsonFixture);
          helper.commitComponent('comp/comp');
          output = helper.showComponentWithOptions('comp/comp', { j: '' });
          packageDependencies = JSON.parse(output).packageDependencies;
          depObject = { 'lodash.get': '^1.0.1' };
          expect(packageDependencies).to.include(depObject);
        });
        it('should take the package version from package.json in the consumer root dir if the package.json not exists in component dir', () => {
          helper.deleteFile(path.join(componentRootDir, 'package.json'));
          helper.commitComponent('comp/comp');
          output = helper.showComponentWithOptions('comp/comp', { j: '' });
          packageDependencies = JSON.parse(output).packageDependencies;
          depObject = { 'lodash.get': '2.0.0' };
          expect(packageDependencies).to.include(depObject);
        });
        it('should take the package version from package.json in the consumer root dir if the package.json in component root dir does not contain the package definition', () => {
          const componentPackageJsonFixture = JSON.stringify({ dependencies: { 'fake.package': '^1.0.1' } });
          helper.createFile(componentRootDir, 'package.json', componentPackageJsonFixture);
          helper.commitComponent('comp/comp');
          output = helper.showComponentWithOptions('comp/comp', { j: '' });
          packageDependencies = JSON.parse(output).packageDependencies;
          depObject = { 'lodash.get': '2.0.0' };
          expect(packageDependencies).to.include(depObject);
        });
        it('should take the package version from the package package.json if the package.json not exists in component / root dir', () => {
          helper.deleteFile(path.join(componentRootDir, 'package.json'));
          helper.deleteFile('package.json');
          helper.commitComponent('comp/comp');
          output = helper.showComponentWithOptions('comp/comp', { j: '' });
          packageDependencies = JSON.parse(output).packageDependencies;
          depObject = { 'lodash.get': '2.0.0' };
          expect(packageDependencies).to.include(depObject);
        });
        it('should take the package version from the package package.json if the package.json in component / root dir does not contain the package definition', () => {
          helper.deleteFile(path.join(componentRootDir, 'package.json'));
          const rootPackageJsonFixture = JSON.stringify({ dependencies: { 'fake.package': '^1.0.1' } });
          helper.createFile('', 'package.json', rootPackageJsonFixture);
          helper.commitComponent('comp/comp');
          output = helper.showComponentWithOptions('comp/comp', { j: '' });
          packageDependencies = JSON.parse(output).packageDependencies;
          depObject = { 'lodash.get': '2.0.0' };
          expect(packageDependencies).to.include(depObject);
        });
      });
    });
  });

  describe('tag non-exist component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    it('should not tag another component', () => {
      const commit = () => helper.commitComponent('non-exist-comp');
      expect(commit).to.throw('the component global/non-exist-comp was not found in the bit.map file');
    });
  });

  describe('tag back', () => {
    // This is specifically export more than one component since it's different case for the
    // resolveLatestVersion.js - getLatestVersionNumber function
    describe('tag component after exporting 2 components', () => {
      let output;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
        helper.addComponentWithOptions('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.createFile('', 'file.js', 'console.log()');
        output = helper.commitAllComponents();
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
    });
  });

  describe('tag already tagged component without changing it', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      output = helper.commitComponent('bar/foo');
    });
    it('should print nothing to tag', () => {
      expect(output).to.have.string('nothing to tag');
    });
    it.skip('should tag the component if -f used', () => {});
  });

  describe('tag imported component with new dependency to another imported component', () => {
    describe('require the main file of the imported component', () => {
      let output;
      let showOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
        helper.addComponentWithOptions('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('comp/comp');
        helper.importComponent('comp/comp2');
        const fileFixture = "var a = require('bit/comp/comp2/file2')";
        helper.createFile('components/comp/comp', 'file.js', fileFixture);
        output = helper.commitComponent('comp/comp');
        showOutput = JSON.parse(helper.showComponentWithOptions('comp/comp', { j: '' }));
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should write the dependency to the component model ', () => {
        const deps = showOutput.dependencies;
        expect(deps.length).to.equal(1);
      });
    });

    describe('require the index file of the imported component', () => {
      let output;
      let showOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
        helper.addComponentWithOptions('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('comp/comp');
        helper.importComponent('comp/comp2');
        const fileFixture = "var a = require('bit/comp/comp2')";
        helper.createFile('components/comp/comp', 'file.js', fileFixture);
        output = helper.commitComponent('comp/comp');
        showOutput = JSON.parse(helper.showComponentWithOptions('comp/comp', { j: '' }));
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should write the dependency to the component model ', () => {
        const deps = showOutput.dependencies;
        expect(deps.length).to.equal(1);
      });
    });
  });

  describe('after requiring an imported component with the relative syntax', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture =
        "const isType = require('../components/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      try {
        helper.commitAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not tag and throw an error regarding the relative syntax', () => {
      expect(output).to.have.string('fatal: following component dependencies were not found');
      expect(output).to.have.string(`relative components (should be absolute): ${helper.remoteScope}/utils/is-type@1`);
    });
  });

  describe('tag all components', () => {
    it('Should print there is nothing to tag right after success tag all', () => {
      // Create component and try to tag twice
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      let output = helper.commitAllComponents();
      output = helper.commitAllComponents();
      expect(output.includes('nothing to tag')).to.be.true;
    });

    it.skip('Should print there is nothing to tag after import only', () => {
      // Import component then try to tag
    });

    it.skip('Should build and test all components before tag', () => {});

    it.skip('Should tag nothing if only some of the tags worked', () => {});

    describe('missing dependencies errors', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponentWithOptions('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js');

        const commitAll = () => helper.commitAllComponents();
        try {
          commitAll();
        } catch (err) {
          output = err.toString();
        }
      });

      // TODO: check why it's working on local and not on ci. i guess it's because we don't know to load the bit-js on CI
      it('Should print that there is missing dependencies', () => {
        expect(output).to.have.string('fatal: following component dependencies were not found');
      });

      it('Should print the components name with missing dependencies', () => {
        expect(output).to.have.string('comp/a');
        expect(output).to.have.string('src/b');
      });

      it('Should print that there is missing dependencies on file system (nested)', () => {
        expect(output).to.have.string('./a3');
        expect(output).to.have.string('./missing-fs');
        expect(output).to.have.string('./b3');
        expect(output).to.have.string('./missing-fs2');
      });

      // TODO: check why it's working on local and not on ci. i guess it's because we don't know to load the bit-js on CI
      it('Should print that there is missing package dependencies on file system (nested)', () => {
        expect(output).to.have.string('package');
        expect(output).to.have.string('package2');
      });

      it('Should print that there is untracked dependencies on file system (nested)', () => {
        expect(output).to.have.string('src/untracked.js');
        expect(output).to.have.string('src/untracked2.js');
      });
    });
    describe('commit component with missing dependencies with --ignore_missing_dependencies', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponentWithOptions('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js');

        const commitOne = () => helper.commitComponent('comp/a', 'commit-msg', '--ignore_missing_dependencies');
        try {
          output = commitOne();
        } catch (err) {
          output = err.toString();
        }
      });

      it('Should print that the component is commited', () => {
        expect(output).to.have.string('1 components tagged');
      });
    });
    describe('commit all components with missing dependencies with --ignore_missing_dependencies', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponentWithOptions('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js');

        const commitAll = () => helper.commitAllComponents('commit-msg', '--ignore_missing_dependencies');
        try {
          output = commitAll();
        } catch (err) {
          output = err.toString();
        }
      });

      it('Should print that the components are commited', () => {
        expect(output).to.have.string('2 components tagged');
      });
    });
    // We throw this error because we don't know the packege version in this case
    it.skip('should throw error if there is missing package dependency', () => {});

    it.skip('should index all components', () => {});

    it.skip('should tag the components in the correct order', () => {});

    it.skip('should add the correct dependencies to each component', () => {
      // Make sure the use case contain dependenceis from all types -
      // Packages, files and bits
    });

    it('should add dependencies for files which are not the main files', () => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      const mainFileFixture =
        "const isString = require('./utils/is-string.js'); const second = require('./second.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      const secondFileFixture =
        "const isType = require('./utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('', 'main.js', mainFileFixture);
      helper.createFile('', 'second.js', secondFileFixture);
      helper.addComponentWithOptions('main.js second.js', { m: 'main.js', i: 'comp/comp' });

      helper.commitAllComponents();

      const output = helper.showComponentWithOptions('comp/comp', { j: '' });
      const dependencies = JSON.parse(output).dependencies;

      const depPathsIsString = {
        sourceRelativePath: 'utils/is-string.js',
        destinationRelativePath: 'utils/is-string.js'
      };
      const depPathsIsType = { sourceRelativePath: 'utils/is-type.js', destinationRelativePath: 'utils/is-type.js' };

      expect(dependencies.find(dep => dep.id === 'utils/is-string').relativePaths[0]).to.deep.equal(depPathsIsString);
      expect(dependencies.find(dep => dep.id === 'utils/is-type').relativePaths[0]).to.deep.equal(depPathsIsType);
    });

    it('should add dependencies for non-main files regardless whether they are required from the main file', () => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      const mainFileFixture =
        "const isString = require('./utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      const secondFileFixture =
        "const isType = require('./utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('', 'main.js', mainFileFixture);
      helper.createFile('', 'second.js', secondFileFixture);
      helper.addComponentWithOptions('main.js second.js', { m: 'main.js', i: 'comp/comp' });

      helper.commitAllComponents();

      const output = helper.showComponentWithOptions('comp/comp', { j: '' });
      const dependencies = JSON.parse(output).dependencies;
      const depPathsIsString = {
        sourceRelativePath: 'utils/is-string.js',
        destinationRelativePath: 'utils/is-string.js'
      };
      const depPathsIsType = { sourceRelativePath: 'utils/is-type.js', destinationRelativePath: 'utils/is-type.js' };

      expect(dependencies.find(dep => dep.id === 'utils/is-string').relativePaths[0]).to.deep.equal(depPathsIsString);
      expect(dependencies.find(dep => dep.id === 'utils/is-type').relativePaths[0]).to.deep.equal(depPathsIsType);
    });

    it.skip('should persist all models in the scope', () => {});

    it.skip('should run the onCommit hook', () => {});
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createComponent('bar', 'index.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
    });
    it('Should commit component only with the left files', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deleteFile('bar/foo.js');
      helper.commitAllComponents();
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(1);
      expect(files[0].name).to.equal('index.js');
    });
    it('Should throw error that all files were removed', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deleteFile('bar/index.js');
      helper.deleteFile('bar/foo.js');

      const commitCmd = () => helper.commitAllComponents();
      expect(commitCmd).to.throw(
        'invalid component bar/foo, all files were deleted, please remove the component using bit remove command\n'
      );
    });
  });
});
