import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('link generation', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('authored components when changing from a directory into a file', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('foo1.js bar/foo2.js', { i: 'bar/foo', m: 'foo1.js' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.fs.deletePath('bar');
      helper.command.status(); // removes the old directory 'bar' from .bitmap
      helper.fs.createFile('', 'bar');
      helper.command.addComponent('bar', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      // a previous bug was throwing an error upon export "EISDIR: illegal operation on a directory, read"
      helper.command.exportAllComponents();
    });
    it('should create a link file in the same place where it was a directory before', () => {
      expect(
        path.join(helper.scopes.localPath, `node_modules/@bit/${helper.scopes.remote}.bar.foo/bar`)
      ).to.be.a.file();
    });
  });
});
