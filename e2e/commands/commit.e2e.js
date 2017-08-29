// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import chalk from 'chalk';
import sinon from 'sinon';

let logSpy;
let errorSpy;

describe('bit commit command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.reInitLocalScope();
    logSpy = sinon.spy(console, 'log');
    errorSpy = sinon.spy(console, 'error');
  });
  describe.skip('commit one component', () => {
    it('should throw error if the bit id does not exists', () => {
    });

    it('should print warning if the a driver is not installed', () => {

      const fixture = "import foo from ./foo; module.exports = function foo2() { return 'got foo'; };";
      helper.createComponent('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js');
      const output = helper.commitAllComponents();
      // var myargs = logSpy.getCalls()[4].args
      // console.log("args", myargs);
      expect( logSpy.calledWith('Warning: Bit is not be able calculate the dependencies tree. Please install bit-javascript driver and run commit again.\n') ).to.be.true;
    });

    it('should persist the model in the scope', () => {
    });

    it('should run the onCommit hook', () => {
    });

    it('should throw error if the build failed', () => {
    });

    it('should throw error if the tests failed', () => {
    });

    describe.skip('commit imported component', () => {
      it('should index the component', () => {
      });

      it('should write the full id to bit map (include scope and version)', () => {
      });

      it('should create fork of the component', () => {
        // Should change the original version origin to nested if it's required by another imported deps
        // Should update all the deps in my own files to use the new version
        // Should move the old version in the fs to be nested
        // Should update the bit.map to point from the new version to the existing file
        // Should bind from other deps to the new fs location
      });
    });

    describe.skip('commit added component', () => {
      it('should index the component', () => {
      });

      it('should successfuly commit if there is no special error', () => {
        // Validate output
        // Validate model
      });

      it('Should throw error if there is tracked files dependencies which not commited yet', () => {
      });

      it('should add the correct dependencies to each component', () => {
      });
    });
  });

  describe('commit non-exist component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    it('should not commit another component', () => {
      const commit = () => helper.commitComponent('non-exist-comp');
      expect(commit).to.throw('the component global/non-exist-comp was not found in the bit.map file');
    });
  });

  describe('commit back', () => {
    // This is specifically export more than one component since it's different case for the
    // resolveLatestVersion.js - getLatestVersionNumber function
    describe('commit component after exporting 2 components', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.reInitRemoteScope();
        helper.addRemoteScope();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
        helper.addComponentWithOptions('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.createFile('', 'file.js', 'console.log()');
        output = helper.commitAllComponents();
      });
      it('should commit the component', () => {
        expect(output).to.have.string('1 components committed');
      });
    });
  });

  describe('commit all components', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });

    it('Should print there is nothing to commit right after success commit all', () => {
      // Create component and try to commit twice
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      let output = helper.commitAllComponents();
      output = helper.commitAllComponents();
      expect(output.includes('nothing to commit')).to.be.true;
    });

    it.skip('Should print there is nothing to commit after import only', () => {
      // Import component then try to commit
    });

    it.skip('Should build and test all components before commit', () => {

    });

    it.skip('Should commit nothing if only some of the commits worked', () => {

    });

    describe('missing dependencies errors', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = 'import a2 from \'./a2\'; import a3 from \'./a3\'';
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture = 'import a3 from \'./a3\';import pdackage from \'package\';import missingfs from \'./missing-fs\';import untracked from \'./untracked.js\';';
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture = 'import b3 from \'./b3\';import pdackage from \'package2\';import missingfs from \'./missing-fs2\';import untracked from \'./untracked2.js\';';
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
        expect(output).to.have.string(path.normalize('src/untracked.js'));
        expect(output).to.have.string(path.normalize('src/untracked2.js'));
      });
    });


    // We throw this error because we don't know the packege version in this case
    it.skip('should throw error if there is missing package dependency', () => {
    });

    it.skip('should index all components', () => {
    });

    it.skip('should commit the components in the correct order', () => {
    });

    it.skip('should add the correct dependencies to each component', () => {
      // Make sure the use case contain dependenceis from all types -
      // Packages, files and bits
    });

    it('should add dependencies for files which are not the main files', () => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      const mainFileFixture = "const isString = require('./utils/is-string.js'); const second = require('./second.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      const secondFileFixture = "const isType = require('./utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('', 'main.js', mainFileFixture);
      helper.createFile('', 'second.js', secondFileFixture);
      helper.addComponentWithOptions('main.js second.js', { 'm': 'main.js', 'i': 'comp/comp' });

      helper.commitAllComponents();

      const output = helper.showComponentWithOptions('comp/comp', { j: '' });
      const dependencies = JSON.parse(output).dependencies;
      const depPaths = [{ sourceRelativePath: 'utils/is-type.js', destinationRelativePath: 'utils/is-type.js' }];
      const depObject = { id: 'utils/is-type', relativePaths: depPaths };
      const depPaths1 = [{ sourceRelativePath: 'utils/is-string.js', destinationRelativePath: 'utils/is-string.js' }];
      const depObject1 = { id: 'utils/is-string', relativePaths: depPaths1 };

      expect(dependencies[0].relativePaths[0]).to.include(depPaths[0]);
      expect(dependencies[1].relativePaths[0]).to.include(depPaths1[0]);
    });

    it.skip('should persist all models in the scope', () => {
    });

    it.skip('should run the onCommit hook', () => {
    });
  });
});
