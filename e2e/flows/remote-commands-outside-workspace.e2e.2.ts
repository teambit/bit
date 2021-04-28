import { expect } from 'chai';

import { ConsumerNotFound } from '../../src/consumer/exceptions';
import Helper from '../../src/e2e-helper/e2e-helper';

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
  describe('exporting a component to a global remote', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath} --global`);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
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
      const output = helper.command.listRemoteScope();
      expect(output).to.have.string('found 1 components');
    });
    it('bit show should show the component and not throw an error about missing workspace', () => {
      const output = helper.command.showComponent(`${helper.scopes.remote}/bar/foo --remote`);
      expect(output).to.have.string('bar/foo');
    });
    describe('bit deprecate with --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.deprecateComponent(`${helper.scopes.remote}/bar/foo`, '--remote');
      });
      it('should not throw an error', () => {
        expect(output).to.have.string('deprecated components');
      });
      it('should deprecate successfully', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list[0].deprecated).to.be.true;
      });
      describe('bit undeprecate with --remote flag', () => {
        let undeprecateOutput;
        before(() => {
          undeprecateOutput = helper.command.undeprecateComponent(`${helper.scopes.remote}/bar/foo`, '--remote');
        });
        it('should not throw an error', () => {
          expect(undeprecateOutput).to.have.string('undeprecated components');
        });
        it('should deprecate successfully', () => {
          const list = helper.command.listRemoteScopeParsed();
          expect(list[0].deprecated).to.be.false;
        });
      });
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
