import { expect } from 'chai';

import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('set, get, delete configs', () => {
    let setOutput;
    let getOutput;
    let delOutput;

    before(() => {
      helper.scopeHelper.reInitWorkspace();
      setOutput = helper.command.runCmd('bit config set conf.key conf.value');
      getOutput = helper.command.runCmd('bit config get conf.key');
      delOutput = helper.command.runCmd('bit config del conf.key');
    });

    it('should set the config correctly', () => {
      expect(setOutput).to.have.string('added configuration successfully\n');
    });

    it('should get the config correctly', () => {
      expect(getOutput).to.have.string('conf.value\n');
    });

    it('should delete the config correctly', () => {
      const confVal = helper.command.runCmd('bit config get conf.key');
      expect(delOutput).to.have.string('deleted successfully\n');
      expect(confVal).to.not.have.string('conf.value');
    });
  });

  describe('saving config in the local workspace', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.setConfig('local.ws', 'hello-ws', '--local-track');
    });
    after(() => {
      helper.command.delConfig('shared-conf');
    });
    it('should save to the workspace when using "--local-track"', () => {
      const list = helper.command.listConfigLocally('workspace');
      expect(list).to.have.property('local.ws');
    });
    it('should be available for config-get', () => {
      const val = helper.command.getConfig('local.ws');
      expect(val).to.include('hello-ws');
    });
    describe('deleting the config', () => {
      before(() => {
        helper.command.delConfig('local.ws');
      });
      it('should not list it anymore', () => {
        const list = helper.command.listConfigLocally('workspace');
        expect(list).to.not.have.property('local.ws');
      });
      it('should not be available for config-get', () => {
        const val = helper.command.getConfig('local.ws');
        expect(val).to.not.include('hello-ws');
      });
    });
    describe('same config in global and workspace', () => {
      before(() => {
        helper.command.setConfig('shared-conf', 'global-val');
        helper.command.setConfig('shared-conf', 'ws-val', '--local-track');
      });
      it('bit config get should return the local one', () => {
        const val = helper.command.getConfig('shared-conf');
        expect(val).to.include('ws-val');
        expect(val).to.not.include('global-val');
      });
    });
  });
  describe('saving config in the local scope', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.setConfig('local.scope', 'hello-scope', '--local');
    });
    it('should save to the scope when using "--local"', () => {
      const list = helper.command.listConfigLocally('scope');
      expect(list).to.have.property('local.scope');
    });
    it('should be available for config-get', () => {
      const val = helper.command.getConfig('local.scope');
      expect(val).to.include('hello-scope');
    });
    describe('deleting the config', () => {
      before(() => {
        helper.command.delConfig('local.scope');
      });
      it('should not list it anymore', () => {
        const list = helper.command.listConfigLocally('scope');
        expect(list).to.not.have.property('local.scope');
      });
      it('should not be available for config-get', () => {
        const val = helper.command.getConfig('local.scope');
        expect(val).to.not.include('hello-scope');
      });
    });
    describe('same config in global and scope', () => {
      before(() => {
        helper.command.setConfig('shared-conf', 'global-val');
        helper.command.setConfig('shared-conf', 'scope-val', '--local');
      });
      it('bit config get should return the local one', () => {
        const val = helper.command.getConfig('shared-conf');
        expect(val).to.include('scope-val');
        expect(val).to.not.include('global-val');
      });
    });
  });
});
