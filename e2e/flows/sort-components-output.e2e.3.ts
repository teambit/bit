import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

/**
 * expect the components 'bar/foo', 'utils/is-string', 'utils/is-type' to be sorted in this order
 */
function expectComponentsToBeSortedAlphabetically(output, start = 0) {
  expect(output.indexOf('bar/foo', start)).to.be.below(output.indexOf('utils/is-string', start));
  expect(output.indexOf('utils/is-string', start)).to.be.below(output.indexOf('utils/is-type', start));
}

describe('basic flow with dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('after adding components', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.command.linkAndRewire();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.command.runCmd('bit status');
      });
      it('should show all of them under new components', () => {
        expect(output).to.not.have.string('no new components');
        expect(output).to.have.string('new components');
      });
      it('should show new components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
    it('bit list should not show any component', () => {
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 0 components');
    });
    describe('after tagging the components', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      describe('bit status', () => {
        let output;
        before(() => {
          output = helper.command.runCmd('bit status');
        });
        it('should show all of them under staged components', () => {
          expect(output).to.not.have.string('no staged components');
          expect(output).to.have.string('staged components');
        });
        it('should show staged components sorted alphabetically', () => {
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
      it('bit list should show the components sorted alphabetically', () => {
        const output = helper.command.listLocalScope();
        expectComponentsToBeSortedAlphabetically(output);
      });
      describe('after modifying the components', () => {
        before(() => {
          helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
          helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
          helper.fs.createFile('bar', 'foo.js', fixtures.barFooFixtureV2);
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.command.runCmd('bit status');
          });
          it('should show all of them under staged components', () => {
            expect(output).to.not.have.string('no staged components');
            expect(output).to.have.string('staged components');
          });
          it('should show staged components sorted alphabetically', () => {
            expectComponentsToBeSortedAlphabetically(output);
          });
        });
        it('bit list should show the components sorted alphabetically', () => {
          const output = helper.command.listLocalScope();
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
      describe('after deleting the components', () => {
        before(() => {
          fs.moveSync(path.join(helper.scopes.localPath, 'utils'), path.join(helper.scopes.localPath, 'utils-bak'));
          fs.moveSync(path.join(helper.scopes.localPath, 'bar'), path.join(helper.scopes.localPath, 'bar-bak'));
        });
        after(() => {
          fs.moveSync(path.join(helper.scopes.localPath, 'utils-bak'), path.join(helper.scopes.localPath, 'utils'));
          fs.moveSync(path.join(helper.scopes.localPath, 'bar-bak'), path.join(helper.scopes.localPath, 'bar'));
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.command.runCmd('bit status');
          });
          it('should show all of them under deleted components', () => {
            expect(output).to.have.string('component files were deleted');
          });
          it('should show deleted components sorted alphabetically', () => {
            expectComponentsToBeSortedAlphabetically(output);
          });
        });
        it('bit list should show the components sorted alphabetically', () => {
          const output = helper.command.listLocalScope();
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
    });
  });
  describe('with missing dependencies', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const isTypeFixture = "const missingDep = require('./non-existA');";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      const isStringFixture =
        "const isType = require('./non-existB.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      const fooBarFixture =
        "const isString = require('./non-existsC.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
      helper.fs.createFile('bar', 'foo.js', fooBarFixture);
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.addComponentBarFoo();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.command.runCmd('bit status');
      });
      it('should show the components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
  });
  describe('with auto-tag pending', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const isTypeFixture = "console.log('got is-type v1')";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
      const fooBarFixture =
        "const isString = require('../utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
      helper.fs.createFile('bar', 'foo.js', fooBarFixture);
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      const isTypeFixtureV2 = "console.log('got is-type v2')";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixtureV2);
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.command.runCmd('bit status');
      });
      it('should show all of them under deleted components', () => {
        expect(output).to.not.have.string('no auto-tag pending components');
        expect(output).to.have.string('components pending to be tagged');
      });
      it('should show the components sorted alphabetically', () => {
        const start = output.indexOf('components pending to be tagged');
        expect(output.indexOf('bar/foo', start)).to.be.below(output.indexOf('utils/is-string', start));
      });
    });
  });
});
