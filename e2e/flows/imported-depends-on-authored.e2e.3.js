import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('imported component that depends on authored component', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  /**
   * at the end, is-type is authored. is-string-is imported. is-string requires is-type
   * in the past it used to throw an error 'Cannot read property 'replace' of undefined'
   */
  describe('with dist outside the components dir', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-string.js', '');
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.importComponent('utils/is-string');
      helper.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.addComponentUtilsIsType();
      helper.importCompiler();
      helper.tagAllComponents();
      helper.exportAllComponents();
      const fixture = `require('@bit/${helper.remoteScope}.utils.is-type');`;
      helper.createFile('components/utils/is-string', 'is-string.js', fixture);
      helper.tagAllComponents();
      helper.exportAllComponents();
      output = helper.importComponent('utils/is-string');
    });
    it('should import successfully', () => {
      expect(output).to.have.string('successfully');
    });
  });
});
