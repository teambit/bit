import chai, { expect } from 'chai';
import path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('repository-hooks', function () {
  let exportOutput;
  let importOutput;
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export to remote scope with manipulation hook', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.copyFixtureFile(
        path.join('scopes', 'repository-hooks-fixture.js'),
        'repository-hooks.js',
        helper.scopes.remotePath
      );
      helper.scopeJson.addKeyVal('hooksPath', './repository-hooks.js', helper.scopes.remotePath);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      exportOutput = helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should run the on persist hook', () => {
      const regex = new RegExp('on persist run', 'g');
      const count = exportOutput.match(regex);
      // 3 objects - component, version and file
      expect(count).to.have.lengthOf(3);
    });

    describe('import from remote scope with manipulation hook', () => {
      before(() => {
        importOutput = helper.command.importComponent('bar/foo');
      });
      it('should run the on read hook', () => {
        const regex = new RegExp('on read run', 'g');
        const count = importOutput.match(regex);
        // total 4 objects - component, version, version-history and file
        // the reason for the 5 reading is that it happens in two places.
        // 1. repository.load(), it reads 2 files, the component and the version objects.
        // 2. repository.loadRaw(), it reads 3 files, component, version and file.
        // ideally, loadRaw could use the cached file from load. but it might be safer to not use the cache,
        // so we make sure the client get the exact file saved in the filesystem on the remote. need to think about it.

        // if this test fails, and the number is bigger than 5. this could indicate a serious performance issue,
        // because for components with large amount of versions, this could become a huge number.
        expect(count).to.have.lengthOf(6);
      });
      it('should be able to import the component as usual', () => {
        expect(importOutput).to.have.string('successfully imported one component');
      });
    });
  });
});
