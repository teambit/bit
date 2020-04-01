import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { UNABLE_TO_LOAD_EXTENSION } from '../../src/constants';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

// Skipped until we implement the loading extensions from variants
describe('load extensions', function() {
  this.timeout(0);
  const helper = new Helper();

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
        helper.extensions.addExtensionToWorkspace('dummy-extension', config);
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
        helper.extensions.addExtensionToWorkspace('non-requireable-extension', config);
      });
      it('should show the workspace status without exception', () => {
        output = helper.command.status();
        expect(output).to.have.string('new components');
      });
      it('should show a warning about the problematic extension', () => {
        output = helper.command.status();
        expect(output).to.have.string(UNABLE_TO_LOAD_EXTENSION('non-requireable-extension'));
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
      // helper.extensions.addExtensionToVariant('affected/*', 'dummy-extension', config);
      helper.extensions.setExtensionToVariant('affected/*', 'dummy-extension', config);
      helper.fs.createFile('affected-comp1', 'comp1.js', '');
      helper.command.addComponent('affected-comp1', { i: 'affected/comp1' });
      helper.fs.createFile('not-affected-comp2', 'comp2.js', '');
      helper.command.addComponent('not-affected-comp2', { i: 'not-affected/comp2' });
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
});
