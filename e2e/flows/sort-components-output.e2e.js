import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

/**
 * expect the components 'bar/foo', 'utils/is-string', 'utils/is-type' to be sorted in this order
 */
function expectComponentsToBeSortedAlphabetically(output, start = 0) {
  expect(output.indexOf('bar/foo', start)).to.be.below(output.indexOf('utils/is-string', start));
  expect(output.indexOf('utils/is-string', start)).to.be.below(output.indexOf('utils/is-type', start));
}

describe('basic flow with dependencies', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('after adding components', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.runCmd('bit status');
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
      const output = helper.runCmd('bit list');
      expect(output).to.have.string('found 0 components');
    });
    describe('after committing the components', () => {
      before(() => {
        helper.commitAllComponents();
      });
      describe('bit status', () => {
        let output;
        before(() => {
          output = helper.runCmd('bit status');
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
        const output = helper.runCmd('bit list');
        expectComponentsToBeSortedAlphabetically(output);
      });
      describe('after modifying the components', () => {
        before(() => {
          const isTypeFixture = "module.exports = function isType() { return 'got is-type v2'; };";
          helper.createComponent('utils', 'is-type.js', isTypeFixture);
          const isStringFixture =
            "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
          helper.createComponent('utils', 'is-string.js', isStringFixture);
          const fooBarFixture =
            "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
          helper.createComponent('bar', 'foo.js', fooBarFixture);
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.runCmd('bit status');
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
          const output = helper.runCmd('bit list');
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
      describe('after deleting the components', () => {
        before(() => {
          fs.moveSync(path.join(helper.localScopePath, 'utils'), path.join(helper.localScopePath, 'utils-bak'));
          fs.moveSync(path.join(helper.localScopePath, 'bar'), path.join(helper.localScopePath, 'bar-bak'));
        });
        after(() => {
          fs.moveSync(path.join(helper.localScopePath, 'utils-bak'), path.join(helper.localScopePath, 'utils'));
          fs.moveSync(path.join(helper.localScopePath, 'bar-bak'), path.join(helper.localScopePath, 'bar'));
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.runCmd('bit status');
          });
          it('should show all of them under deleted components', () => {
            expect(output).to.not.have.string('no deleted components');
            expect(output).to.have.string('deleted components');
          });
          it('should show deleted components sorted alphabetically', () => {
            expectComponentsToBeSortedAlphabetically(output);
          });
        });
        it('bit list should show the components sorted alphabetically', () => {
          const output = helper.runCmd('bit list');
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
    });
  });
  describe('with missing dependencies', () => {
    before(() => {
      helper.reInitLocalScope();
      const isTypeFixture = "const missingDep = require('./non-existA');";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      const isStringFixture =
        "const isType = require('./non-existB.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      const fooBarFixture =
        "const isString = require('./non-existsC.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
      helper.createComponent('bar', 'foo.js', fooBarFixture);
      helper.addComponent('utils/is-type.js');
      helper.addComponent('utils/is-string.js');
      helper.addComponentBarFoo();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.runCmd('bit status');
      });
      it('should show the components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
  });
  describe('with auto-tag pending', () => {
    before(() => {
      helper.reInitLocalScope();
      const isTypeFixture = "console.log('got is-type v1')";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      const fooBarFixture =
        "const isString = require('../utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
      helper.createComponent('bar', 'foo.js', fooBarFixture);
      helper.addComponent('utils/is-type.js');
      helper.addComponent('utils/is-string.js');
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      const isTypeFixtureV2 = "console.log('got is-type v2')";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV2);
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.runCmd('bit status');
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
