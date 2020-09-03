import { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import { ScopeNotFound } from '../../src/scope/exceptions';

describe('bit remote command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding a global remote', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath} --global`);
    });
    it('should be shown when running "bit remote"', () => {
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.scopes.remote);
    });
    it('should be shown from any other workspace as well', () => {
      helper.scopeHelper.reInitLocalScope();
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.scopes.remote);
    });
    describe('deleting remote', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
      });
      it('deleting a non-exist remote should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit remote del non-exist-remote');
        expect(output).to.have.string('remote "non-exist-remote" was not found');
      });
      it('deleting the global remote without "--global" flag should throw an error', () => {
        const output = helper.general.runWithTryCatch(`bit remote del ${helper.scopes.remote}`);
        expect(output).to.have.string(
          `remote "${helper.scopes.remote}" was not found locally, to remove a global remote, please use "--global" flag`
        );
      });
      it('should successfully delete the global remote when "--global" flag was used', () => {
        const output = helper.command.runCmd(`bit remote del ${helper.scopes.remote} --global`);
        expect(output).to.have.string('successfully removed remote');

        const remotes = helper.command.runCmd('bit remote');
        expect(remotes).to.not.have.string(helper.scopes.remote);
      });
    });
  });
  describe('adding a local remote', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
    });
    it('should be shown when running "bit remote"', () => {
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.scopes.remote);
    });
    it('should not be shown from other workspace', () => {
      helper.scopeHelper.reInitLocalScope();
      const output = helper.command.runCmd('bit remote');
      expect(output).to.not.have.string(helper.scopes.remote);
    });
    describe('deleting remote', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
      });
      it('deleting the remote with "--global" flag should throw an error', () => {
        const output = helper.general.runWithTryCatch(`bit remote del ${helper.scopes.remote} --global`);
        expect(output).to.have.string(
          `remote "${helper.scopes.remote}" was not found globally, to remove a local remote, please omit the "--global" flag`
        );
      });
      it('should successfully delete the remote when "--global" flag was not used', () => {
        const output = helper.command.runCmd(`bit remote del ${helper.scopes.remote}`);
        expect(output).to.have.string('successfully removed remote');

        const remotes = helper.command.runCmd('bit remote');
        expect(remotes).to.not.have.string(helper.scopes.remote);
      });
    });
  });
  describe('adding a non exist local remote with relative path', () => {
    it('should throw ScopeNotFound error', () => {
      const func = () => helper.command.runCmd('bit remote add file://non-exist-dir');
      const error = new ScopeNotFound(path.join(helper.scopes.localPath, 'non-exist-dir'));
      helper.general.expectToThrow(func, error);
    });
  });
});
