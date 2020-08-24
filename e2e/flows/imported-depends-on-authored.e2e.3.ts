import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

describe('imported component that depends on authored component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  /**
   * at the end, is-type is authored. is-string-is imported. is-string requires is-type
   * in the past it used to throw an error 'Cannot read property 'replace' of undefined'
   */
  describe('with dist outside the components dir', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-string.js', '');
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
      helper.command.importComponent('utils/is-string');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.env.importCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      const fixture = `require('@bit/${helper.scopes.remote}.utils.is-type');`;
      helper.fs.createFile('components/utils/is-string', 'is-string.js', fixture);
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      output = helper.command.importComponent('utils/is-string');
    });
    it('should import successfully', () => {
      expect(output).to.have.string('successfully');
    });
  });
});
