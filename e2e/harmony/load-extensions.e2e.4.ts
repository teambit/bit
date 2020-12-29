import chai, { expect } from 'chai';
import path from 'path';

import {
  UNABLE_TO_LOAD_EXTENSION,
  UNABLE_TO_LOAD_EXTENSION_FROM_LIST,
} from '../../scopes/harmony/aspect-loader/constants';
import { CannotLoadExtension } from '../../scopes/harmony/aspect-loader/exceptions';
// TODO: think about how to change this require or move this tests
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

// @TODO: REMOVE THE SKIP ASAP
describe('load extensions', function () {
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
        helper.scopeHelper.reInitLocalWorkspaceHarmonyForNewAspects();
        helper.fixtures.copyFixtureExtensions('dummy-extension');
        helper.extensions.addExtensionToVariant('dummy-extension', 'teambit.harmony/aspect');
        helper.command.addComponent('dummy-extension');
        helper.command.install();
        helper.command.compile();
        helper.extensions.addExtensionToWorkspace('my-scope/dummy-extension', config);
      });
      it('should load the extension when loading the workspace', () => {
        output = helper.command.status();
        expect(output).to.have.string('dummy extension runs');
      });
    });
    describe('non requireable extension', () => {
      before(() => {
        helper.scopeHelper.reInitLocalWorkspaceHarmonyForNewAspects();
        helper.fixtures.copyFixtureExtensions('non-requireable-aspect');
        helper.command.addComponent('non-requireable-aspect');
        helper.extensions.addExtensionToVariant('non-requireable-aspect', 'teambit.harmony/aspect');
        helper.extensions.addExtensionToWorkspace('my-scope/non-requireable-aspect', config);
        helper.command.install();
        helper.command.compile();
      });
      // TODO: implement
      it.skip('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.status();
        const origError = new Error('error by purpose');
        const error = new CannotLoadExtension('non-requireable-aspect', origError);
        helper.general.expectToThrow(func, error);
      });
      describe('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION('my-scope/non-requireable-aspect'));
        });
      });
    });
    describe('extension with provider error', () => {
      before(() => {
        helper.scopeHelper.reInitLocalWorkspaceHarmonyForNewAspects();
        helper.fixtures.copyFixtureExtensions('extension-provider-error');
        helper.command.addComponent('extension-provider-error');
        helper.extensions.addExtensionToWorkspace('my-scope/extension-provider-error', config);
        helper.extensions.addExtensionToVariant('extension-provider-error', 'teambit.harmony/aspect');
        helper.command.install();
        helper.command.compile();
      });
      it.skip('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.status();
        const error = new Error('error in provider');
        helper.general.expectToThrow(func, error);
      });
      // TODO: implement
      describe('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION_FROM_LIST(['my-scope/extension-provider-error']));
        });
      });
    });
  });

  describe('variants extensions', () => {
    const config = { key: 'val' };
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.copyFixtureExtensions('dummy-extension');
      helper.command.addComponent('dummy-extension');
      helper.fixtures.copyFixtureExtensions('non-requireable-aspect');
      helper.fixtures.copyFixtureExtensions('extension-provider-error');
      helper.command.addComponent('extension-provider-error');
      helper.command.addComponent('non-requireable-aspect');
      helper.fs.outputFile(path.join('affected-comp1', 'comp1.js'), '');
      helper.command.addComponent('affected-comp1', { i: 'affected/comp1' });
      helper.fs.outputFile(path.join('not-affected-comp2', 'comp2.js'), '');
      helper.command.addComponent('not-affected-comp2', { i: 'not-affected/comp2' });
      helper.extensions.addExtensionToVariant('dummy-extension', 'teambit.harmony/aspect');
    });
    describe('loading simple extension', () => {
      before(() => {
        helper.extensions.setExtensionToVariant('affected-comp1', 'my-scope/dummy-extension', config);
        helper.command.install();
        helper.command.compile();
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
        helper.extensions.setExtensionToVariant('affected-comp1', 'my-scope/non-requireable-aspect', config);
      });
      it.skip('when config set to throw error on failed extensions', () => {
        const func = () => helper.command.showComponent('affected/comp1');
        const origError = new Error('error by purpose');
        const error = new CannotLoadExtension('non-requireable-aspect', origError);
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
          expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION('non-requireable-aspect'));
        });
      });
    });
    describe('extension with provider error', () => {
      before(() => {
        helper.extensions.setExtensionToVariant('affected-comp1', 'my-scope/extension-provider-error', config);
      });
      it.skip('when config set to throw error on failed extensions', () => {
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
