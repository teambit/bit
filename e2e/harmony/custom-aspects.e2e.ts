import chai, { expect } from 'chai';
import path from 'path';
import os from 'os';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('custom aspects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('create custom aspect', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.command.create('aspect', 'custom-aspect');
      helper.bitJsonc.setVariant(undefined, 'my-scope/custom-aspect', { 'teambit.harmony/aspect': {} });
      helper.command.compile();
      helper.command.install();
    });
    it.only('should', () => {});
  });
});
