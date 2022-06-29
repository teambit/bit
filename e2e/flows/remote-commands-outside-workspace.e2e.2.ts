import { expect } from 'chai';

import { ConsumerNotFound } from '../../src/consumer/exceptions';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit remote command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('exporting a component to a global remote', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.reInitRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath} --global`);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.cleanLocalScope();
    });
    after(() => {
      helper.command.runCmd(`bit remote del ${helper.scopes.remote} --global`);
    });
    it('bit status should throw an error ConsumerNotFound', () => {
      const error = new ConsumerNotFound();
      const func = () => helper.command.status();
      helper.general.expectToThrow(func, error);
    });
    it('bit list without --remote flag should throw an error ConsumerNotFound', () => {
      const error = new ConsumerNotFound();
      const func = () => helper.command.listLocalScope();
      helper.general.expectToThrow(func, error);
    });
    it('bit list with --remote flag should list the global remote successfully', () => {
      const output = helper.command.listRemoteScope(false);
      expect(output).to.have.string('found 1 components');
    });
    it('bit show should show the component and not throw an error about missing workspace', () => {
      const output = helper.command.showComponent(`${helper.scopes.remote}/bar/foo --remote`);
      expect(output).to.have.string('bar/foo');
    });
    describe('bit remove with --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo`, '--remote');
      });
      it('should not throw an error', () => {
        expect(output).to.have.string('successfully removed');
      });
      it('should remove successfully', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(0);
      });
    });
  });
});
