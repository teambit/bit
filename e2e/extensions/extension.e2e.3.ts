import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('extension', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('create new extension component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.createNewComponentExtension();
    });
    it('should load the extension successfully', () => {
      const status = helper.command.status();
      expect(status).to.have.string('hi there from an extension, got config: {}');
    });
  });
});
