import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit _scope command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('for non exist scope', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const nonExistScopePath = Buffer.from('/non/exist/dir').toString('base64');
      const header = Buffer.from(JSON.stringify({ headers: { version: '13.0.0-dev.4' } })).toString('base64');
      output = helper.general.runWithTryCatch(`bit _scope ${nonExistScopePath} ${header}`);
    });
    it('should throw ScopeNotFound error', () => {
      expect(output).to.have.string('ScopeNotFound');
    });
  });
});
