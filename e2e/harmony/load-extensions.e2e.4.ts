import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
// TODO: think about how to change this require or move this tests
import {
  UNABLE_TO_LOAD_EXTENSION,
  UNABLE_TO_LOAD_EXTENSION_FROM_LIST
} from '../../src/extensions/utils/load-extensions/constants';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('load extensions', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace extensions', () => {
    const config = { key: 'val' };
    let output;
    describe('loading simple extension', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.copyFixtureExtensions('dummy-extension');
        helper.command.addComponent('dummy-extension');
        helper.extensions.addExtensionToWorkspace('my-scope/dummy-extension', config);
      });
      it('should load the extension when loading the workspace', () => {
        output = helper.command.status();
        expect(output).to.have.string('dummy extension runs');
      });
    });
    describe('non requireable extension', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.copyFixtureExtensions('non-requireable-extension');
        helper.command.addComponent('non-requireable-extension');
        helper.extensions.addExtensionToWorkspace('my-scope/non-requireable-extension', config);
      });
      it('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.status();
        const error = new Error('error by purpose');
        helper.general.expectToThrow(func, error);
      });
      // TODO: implement
      describe.skip('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION('non-requireable-extension'));
        });
      });
    });
    describe('extension with provider error', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.copyFixtureExtensions('extension-provider-error');
        helper.command.addComponent('extension-provider-error');
        helper.extensions.addExtensionToWorkspace('my-scope/extension-provider-error', config);
      });
      it('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.status();
        const error = new Error('error in provider');
        helper.general.expectToThrow(func, error);
      });
      // TODO: implement
      describe.skip('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION_FROM_LIST(['extension-provider-error']));
        });
      });
    });
  });

  describe('variants extensions', () => {
    const config = { key: 'val' };
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureExtensions('dummy-extension');
      helper.command.addComponent('dummy-extension');
      helper.fixtures.copyFixtureExtensions('non-requireable-extension');
      helper.fixtures.copyFixtureExtensions('extension-provider-error');
      helper.command.addComponent('extension-provider-error');
      helper.command.addComponent('non-requireable-extension');
      helper.fs.createFile('affected-comp1', 'comp1.js', '');
      helper.command.addComponent('affected-comp1', { i: 'affected/comp1' });
      helper.fs.createFile('not-affected-comp2', 'comp2.js', '');
      helper.command.addComponent('not-affected-comp2', { i: 'not-affected/comp2' });
    });
    describe('loading simple extension', () => {
      before(() => {
        // helper.extensions.addExtensionToVariant('affected/*', 'dummy-extension', config);
        helper.extensions.setExtensionToVariant('affected/*', 'my-scope/dummy-extension', config);
      });

      it('should load the extension when loading an affected component', () => {
        output = helper.command.showComponent('affected/comp1');
        expect(output).to.have.string('dummy extension runs');
      });

      it('should not load the extension when loading a not affected component', () => {
        output = helper.command.showComponent('not-affected/comp2');
        expect(output).to.not.have.string('dummy extension runs');
      });
    });
    describe('non requireable extension', () => {
      before(() => {
        helper.extensions.setExtensionToVariant('affected/*', 'my-scope/non-requireable-extension', config);
      });
      it('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.showComponent('affected/comp1');
        const error = new Error('error by purpose');
        helper.general.expectToThrow(func, error);
      });
      // TODO: implement
      describe.skip('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should load the component with problematic extension without error', () => {
          expect(output).to.have.string('Id');
          expect(output).to.have.string('Language');
          expect(output).to.have.string('Main File');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION('non-requireable-extension'));
        });
      });
    });
    describe('extension with provider error', () => {
      before(() => {
        helper.extensions.setExtensionToVariant('affected/*', 'my-scope/extension-provider-error', config);
      });
      it('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.showComponent('affected/comp1');
        const error = new Error('error in provider');
        helper.general.expectToThrow(func, error);
      });
      // TODO: implement
      describe.skip('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.showComponent('affected/comp1');
        });
        it('should load the component with problematic extension without error', () => {
          expect(output).to.have.string('Id');
          expect(output).to.have.string('Language');
          expect(output).to.have.string('Main File');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION_FROM_LIST(['extension-provider-error']));
        });
      });
    });
  });
});
