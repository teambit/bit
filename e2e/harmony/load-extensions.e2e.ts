import stripAnsi from 'strip-ansi';
import { expect } from 'chai';
import path from 'path';

import {
  UNABLE_TO_LOAD_EXTENSION,
  UNABLE_TO_LOAD_EXTENSION_FROM_LIST,
} from '../../scopes/harmony/aspect-loader/constants';
// TODO: think about how to change this require or move this tests
import { Helper } from '@teambit/legacy.e2e-helper';

describe('load extensions', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace extensions', () => {
    const config = { key: 'val' };
    let output;
    describe('loading simple extension', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
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
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.fixtures.copyFixtureExtensions('non-requireable-aspect');
        helper.command.addComponent('non-requireable-aspect');
        helper.extensions.addExtensionToVariant('non-requireable-aspect', 'teambit.harmony/aspect');
        helper.extensions.addExtensionToWorkspace('my-scope/non-requireable-aspect', config);
        helper.command.install();
        helper.command.compile();
      });
      // the "throw on failed extensions" side was never implemented - a permanently-skipped test for
      // it used to sit here. only the ignore-errors behaviour below is actually wired up.
      describe('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(
            UNABLE_TO_LOAD_EXTENSION('my-scope/non-requireable-aspect', 'error by purpose')
          );
        });
      });
    });
    describe('extension with provider error', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.fixtures.copyFixtureExtensions('extension-provider-error');
        helper.command.addComponent('extension-provider-error');
        helper.extensions.addExtensionToWorkspace('my-scope/extension-provider-error', config);
        helper.extensions.addExtensionToVariant('extension-provider-error', 'teambit.harmony/aspect');
        helper.command.install();
        helper.command.compile();
      });
      // same here: the "throw on failed extensions" variant is unimplemented, so only the
      // ignore-errors behaviour is asserted.
      describe('when config set to ignore error on failed extensions', () => {
        before(() => {
          // TODO: set config to ignore errors and restore it in the end
          output = helper.command.status();
        });
        it('should show the workspace status without exception', () => {
          expect(output).to.have.string('new components');
        });
        it('should show a warning about the problematic extension', () => {
          expect(output).to.have.string(
            stripAnsi(
              UNABLE_TO_LOAD_EXTENSION_FROM_LIST(
                ['my-scope/extension-provider-error'],
                'error in provider',
                'teambit.workspace/workspace (cli.registerOnStart)'
              )
            )
          );
        });
      });
    });
  });

  describe('variants extensions', () => {
    const config = { key: 'val' };
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.copyFixtureExtensions('dummy-extension');
      helper.command.addComponent('dummy-extension');
      // the non-requireable / provider-error fixtures used to be tracked here for two describes that
      // only held skipped tests. nothing references them now, so they are no longer installed+compiled
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
    // the "non requireable extension" and "extension with provider error" variants used to have a
    // describe each here, but every test inside them was skipped (an unimplemented throw-on-error
    // case plus a skipped ignore-errors block), so they only ran setExtensionToVariant setup and
    // asserted nothing. both failure modes are covered against the workspace above.
  });
});
