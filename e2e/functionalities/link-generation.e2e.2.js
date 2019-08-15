import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('link generation', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('authored components when changing from a directory into a file', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.addComponent('foo1.js bar/foo2.js', { i: 'bar/foo', m: 'foo1.js' });
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.deletePath('bar');
      helper.status(); // removes the old directory 'bar' from .bitmap
      helper.createFile('', 'bar');
      helper.addComponent('bar', { i: 'bar/foo' });
      helper.tagAllComponents();
      // a previous bug was throwing an error upon export "EISDIR: illegal operation on a directory, read"
      helper.exportAllComponents();
    });
    it('should create a link file in the same place where it was a directory before', () => {
      expect(path.join(helper.localScopePath, `node_modules/@bit/${helper.remoteScope}.bar.foo/bar`)).to.be.a.file();
    });
  });
});
