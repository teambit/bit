import path from 'path';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { ScopeNotFound } from '../../src/scope/exceptions';

describe('bit remote command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('adding a global remote', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.command.runCmd(`bit remote add file://${helper.remoteScopePath} --global`);
    });
    it('should be shown when running "bit remote"', () => {
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.remoteScope);
    });
    it('should be shown from any other workspace as well', () => {
      helper.reInitLocalScope();
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.remoteScope);
    });
    describe('deleting remote', () => {
      before(() => {
        helper.reInitLocalScope();
      });
      it('deleting a non-exist remote should throw an error', () => {
        const output = helper.runWithTryCatch('bit remote del non-exist-remote');
        expect(output).to.have.string('remote "non-exist-remote" was not found');
      });
      it('deleting the global remote without "--global" flag should throw an error', () => {
        const output = helper.runWithTryCatch(`bit remote del ${helper.remoteScope}`);
        expect(output).to.have.string(
          `remote "${helper.remoteScope}" was not found locally, to remove a global remote, please use "--global" flag`
        );
      });
      it('should successfully delete the global remote when "--global" flag was used', () => {
        const output = helper.command.runCmd(`bit remote del ${helper.remoteScope} --global`);
        expect(output).to.have.string('successfully removed remote');

        const remotes = helper.command.runCmd('bit remote');
        expect(remotes).to.not.have.string(helper.remoteScope);
      });
    });
  });
  describe('adding a local remote', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.command.runCmd(`bit remote add file://${helper.remoteScopePath}`);
    });
    it('should be shown when running "bit remote"', () => {
      const output = helper.command.runCmd('bit remote');
      expect(output).to.have.string(helper.remoteScope);
    });
    it('should not be shown from other workspace', () => {
      helper.reInitLocalScope();
      const output = helper.command.runCmd('bit remote');
      expect(output).to.not.have.string(helper.remoteScope);
    });
    describe('deleting remote', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.command.runCmd(`bit remote add file://${helper.remoteScopePath}`);
      });
      it('deleting the remote with "--global" flag should throw an error', () => {
        const output = helper.runWithTryCatch(`bit remote del ${helper.remoteScope} --global`);
        expect(output).to.have.string(
          `remote "${
            helper.remoteScope
          }" was not found globally, to remove a local remote, please omit the "--global" flag`
        );
      });
      it('should successfully delete the remote when "--global" flag was not used', () => {
        const output = helper.command.runCmd(`bit remote del ${helper.remoteScope}`);
        expect(output).to.have.string('successfully removed remote');

        const remotes = helper.command.runCmd('bit remote');
        expect(remotes).to.not.have.string(helper.remoteScope);
      });
    });
  });
  describe('adding a non exist local remote with relative path', () => {
    it('should throw ScopeNotFound error', () => {
      const func = () => helper.command.runCmd('bit remote add file://non-exist-dir');
      const error = new ScopeNotFound(path.join(helper.localScopePath, 'non-exist-dir'));
      helper.expectToThrow(func, error);
    });
  });
});
