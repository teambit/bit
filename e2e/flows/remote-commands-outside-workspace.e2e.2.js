import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { ConsumerNotFound } from '../../src/consumer/exceptions';

describe('bit remote command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('exporting a component to a global remote', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.runCmd(`bit remote add file://${helper.remoteScopePath} --global`);
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.cleanLocalScope();
    });
    after(() => {
      helper.runCmd(`bit remote del ${helper.remoteScope} --global`);
    });
    it('bit status should throw an error ConsumerNotFound', () => {
      const error = new ConsumerNotFound();
      const func = () => helper.status();
      helper.expectToThrow(func, error);
    });
    it('bit list without --remote flag should throw an error ConsumerNotFound', () => {
      const error = new ConsumerNotFound();
      const func = () => helper.listLocalScope();
      helper.expectToThrow(func, error);
    });
    it('bit list with --remote flag should list the global remote successfully', () => {
      const output = helper.listRemoteScope();
      expect(output).to.have.string('found 1 components');
    });
    it('bit show should show the component and not throw an error about missing workspace', () => {
      const output = helper.showComponent(`${helper.remoteScope}/bar/foo --remote`);
      expect(output).to.have.string('bar/foo');
    });
    describe('bit deprecate with --remote flag', () => {
      let output;
      before(() => {
        output = helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '--remote');
      });
      it('should not throw an error', () => {
        expect(output).to.have.string('deprecated components');
      });
      it('should deprecate successfully', () => {
        const list = helper.listRemoteScopeParsed();
        expect(list[0].deprecated).to.be.true;
      });
      describe('bit undeprecate with --remote flag', () => {
        let undeprecateOutput;
        before(() => {
          undeprecateOutput = helper.undeprecateComponent(`${helper.remoteScope}/bar/foo`, '--remote');
        });
        it('should not throw an error', () => {
          expect(undeprecateOutput).to.have.string('undeprecated components');
        });
        it('should deprecate successfully', () => {
          const list = helper.listRemoteScopeParsed();
          expect(list[0].deprecated).to.be.false;
        });
      });
    });
    describe('bit remove with --remote flag', () => {
      let output;
      before(() => {
        output = helper.removeComponent(`${helper.remoteScope}/bar/foo`, '--silent --remote');
      });
      it('should not throw an error', () => {
        expect(output).to.have.string('successfully removed');
      });
      it('should remove successfully', () => {
        const list = helper.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(0);
      });
    });
  });
});
