// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import chalk from 'chalk';
import sinon from 'sinon';

let logSpy;
let errorSpy

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
      expect(output.includes('There is nothing to commit')).to.be.true;
    });

    it.skip('Should print there is nothing to commit after import only', () => {
      // Import component then try to commit
    });

    it('Should throw error if there is missing dependencies on file system', () => {
      const fixture = "import foo from './foo'; module.exports = function foo2() { return 'got foo'; };";
      helper.createComponent('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js');
      const commitAll = () => helper.commitAllComponents();
      expect(commitAll).to.throw('Command failed: bit-dev commit -am commit-message\nfatal: The following dependencies not found on file system - "./foo"\n');
    });

    it('Should throw error if there is untracked files dependencies', () => {
      helper.createComponentBarFoo();
      const fixture = "import foo from './foo'; module.exports = function foo2() { return 'got foo'; };";
      helper.createComponent('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js');
      const commitAll = () => helper.commitAllComponents();
      expect(commitAll).to.throw('Command failed: bit-dev commit -am commit-message\nfatal: The following dependencies not found - "bar/foo.js"\n');      
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

    it.skip('should persist all models in the scope', () => {
    });

    it.skip('should run the onCommit hook', () => {
    });
  });
});
